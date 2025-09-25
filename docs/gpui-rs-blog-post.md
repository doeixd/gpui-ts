# Ownership and data flow in GPUI
Nathan Sobo
Nathan Sobo

January 25th, 2024

One of the challenges we initially faced building Zed's user interface was Rust's strict ownership system. In Rust, every object has a single unique owner, which strongly encourages all data to be organized as a tree without cyclic references or shared ownership. Prior to building Zed, most of my experience writing GUI code was with web technology, where the JavaScript garbage collector means you don't really need to think about ownership. It's easy, for example, to attach a mouse event listener to a DOM node that captures a reference to this, and most of my intuition about building UI was based on this paradigm. In Rust, capturing self in an event listener is the opposite of straightforward.

So when we started on Zed in 2019, it was clear that we would need to rethink much of what we'd learned using the web and other frameworks. We needed a system that fit well with Rust, but we also needed dynamism to express a real-world graphical interface. For example, Zed's workspace can display modal dialogs of various types, and these dialogs need to be able to emit events to the workspace to indicate when they should be closed. We also needed to support updating subtrees asynchronously, such as in the project panel when the file system changes. There are of course many more examples, and we wanted to handle them all without forcing the use of exotic data structures to represent application state. As much as possible, we wanted to avoid macros and use plain Rust structs.

After initial attempts to use built-in types such as Rc went poorly, we began experimenting with an approach that persists to this day in Zed's custom-built UI framework, GPUI. In GPUI, every model or view in the application is actually owned by a single top-level object called the AppContext. When you create a new model or view, which we refer to collectively as entities, you give the application ownership of the state to enable it to participate in a variety of app services and interact with other entities.

To illustrate, consider the trivial app below. We start the app by calling run with a callback, which is passed a reference to the AppContext that owns all the state for the application. This AppContext is our gateway to all application-level services, such as opening windows, presenting dialogs, etc. It also has a new_model method, which we call below to create a model and give ownership of it to the application.

use gpui::{prelude::*, App, AppContext, Model};
 
struct Counter {
    count: usize,
}
 
fn main() {
    App::new().run(|cx: &mut AppContext| {
        let counter: Model<Counter> = cx.new_model(|_cx| Counter { count: 0 });
        // ...
    });
}

The call to new_model returns a model handle, which carries a type parameter based on the type of object it references. By itself, this Model<Counter> handle doesn't provide access to the model's state. It's merely an inert identifier plus a compile-time type tag, and it maintains a reference count to the underlying Counter object that is owned by the app.

Much like an Rc from the Rust standard library, this reference count is incremented when the handle is cloned and decremented when it is dropped to enable shared ownership to the underlying model, but unlike an Rc it only provides access to the model's state when a reference to an AppContext is available. The handle doesn't truly own the state, but it can be used to access the state from its true owner, the AppContext. Let's continue our simple example and use the context to increment the counter. I'll strip away some of the setup code for brevity.

App::new().run(|cx: &mut AppContext| {
    let counter = cx.new_model(|_cx| Counter { count: 0 });
    // Call `update` to access the model's state.
    counter.update(cx, |counter: &mut Counter, cx: &mut ModelContext<Counter>| {
        counter.count += 1;
    });
});

To update the counter, we call update on the handle, passing the context reference and a callback. The callback is yielded a mutable reference to the counter, which we can use to manipulate state.

The callback is also provided a second ModelContext<Counter> reference. This reference is similar to the AppContext reference provided to the run callback. A ModelContext is actually a wrapper around the AppContext, but it includes some additional data to indicate that ties it to a particular model, in this case our counter.

In addition to the application-level services provided by AppContext, a ModelContext provides access to model-level services. For example, we can use it to inform observers of this model that its state has changed. Let's add that to our example, by calling cx.notify().

App::new().run(|cx: &mut AppContext| {
    let counter = cx.new_model(|_cx| Counter { count: 0 });
    counter.update(cx, |counter, cx| {
        counter.count += 1;
        cx.notify(); // Notify observers
    });
});

Next lets see how we can observe these notifications. Before we update the counter, we'll construct a second counter that observes it. Whenever the first counter changes, we'll assign double its count to the second counter. Note how we call observe on the ModelContext belonging to our second counter to arrange for it to be notified whenever the first counter notifies. The call to observe returns a Subscription, which we detach to preserve this behavior for as long as both counters exist. We could also store this subscription and drop it at a time of our choosing to cancel this behavior.

The observe callback is passed a mutable reference to the observer and a handle to the observed counter, whose state we access with the read method.

App::new().run(|cx: &mut AppContext| {
    let counter: Model<Counter> = cx.new_model(|_cx| Counter { count: 0 });
    let observer = cx.new_model(|cx: &mut ModelContext<Counter>| {
        cx.observe(&counter, |observer, observed, cx| {
            observer.count = observed.read(cx).count * 2;
        })
        .detach();
 
        Counter {
            count: 0,
        }
    });
 
    counter.update(cx, |counter, cx| {
        counter.count += 1;
        cx.notify();
    });
 
    assert_eq!(observer.read(cx).count, 2);
});

After updating the first counter, you see that the observing counters state is maintained according to our subscription.

In addition to observe and notify, which indicate that an entity's state has changed, GPUI also offers subscribe and emit, which enables entities to emit typed events. To opt into this system, the emitting object must implement the EventEmitter trait.

Let's introduce a new event type called CounterChangeEvent, then indicate that Counter can emit this type of event.

struct CounterChangeEvent {
    increment: usize,
}
 
impl EventEmitter<CounterChangeEvent> for Counter {}

Next, we'll update our example, replacing the observation with a subscription. Whenever we increment the counter, we'll emit a Change event to indicate by how much it's increasing.

App::new().run(|cx: &mut AppContext| {
    let counter: Model<Counter> = cx.new_model(|_cx| Counter { count: 0 });
    let subscriber = cx.new_model(|cx: &mut ModelContext<Counter>| {
        cx.subscribe(&counter, |subscriber, _emitter, event, _cx| {
            subscriber.count += event.increment * 2;
        })
        .detach();
 
        Counter {
            count: counter.read(cx).count * 2,
        }
    });
 
    counter.update(cx, |counter, cx| {
        counter.count += 2;
        cx.emit(CounterChangeEvent { increment: 2 });
        cx.notify();
    });
 
    assert_eq!(subscriber.read(cx).count, 4);
});

Now let's dig a bit into GPUI's internals to explore how observation and subscriptions are implemented.

Before diving into the details of GPUI's event handling, I'd like to recount an instructive experience from my past work on the Atom editor, where I had implemented a custom event system in JavaScript. At that time, I designed what seemed like a straightforward event emitter, where event listeners were kept in an array and each listener was called sequentially when an event was emitted.

This simplicity, however, led to a subtle bug that went unnoticed until the code was widely used in production. The problem manifested when one listener function emitted an event to the same emitter it was subscribed to. This inadvertently triggered reentrancy, where the emitting function was called again before it had completed its execution. This recursive-like behavior contradicted our expectation of linear function execution and got us into an unexpected state. Even though JavaScript's garbage collector enforces memory safety, the language's relaxed ownership model made it easy for me to write this bug.

Rust's constraints make this naive approach to rather more difficult. We're strongly encouraged down a different path, which prevents the kind of reetrancy I described above. In GPUI, when you call emit or notify, no listeners are invoked. Instead, we push data to a queue of effects. At the end of each update we flush these effects, popping from the front of the queue until it becomes empty and then returning control to the event loop. Any effect handler can itself push more effects, but the system eventually quiesces. This gives us run-to-completion semantics without reentrancy bugs and plays nicely with Rust.

Here's the core of this approach from app.rs. I'll explain below.

impl AppContext {
    pub(crate) fn update<R>(&mut self, update: impl FnOnce(&mut Self) -> R) -> R {
        self.pending_updates += 1;
        let result = update(self);
        if !self.flushing_effects && self.pending_updates == 1 {
            self.flushing_effects = true;
            self.flush_effects();
            self.flushing_effects = false;
        }
        self.pending_updates -= 1;
        result
    }
 
    fn flush_effects(&mut self) {
        loop {
            self.release_dropped_entities();
            self.release_dropped_focus_handles();
 
            if let Some(effect) = self.pending_effects.pop_front() {
                match effect {
                    Effect::Notify { emitter } => {
                        self.apply_notify_effect(emitter);
                    }
 
                    Effect::Emit {
                        emitter,
                        event_type,
                        event,
                    } => self.apply_emit_effect(emitter, event_type, event),
 
                    // A few more effects, elided for clarity
                }
            } else {
                for window in self.windows.values() {
                    if let Some(window) = window.as_ref() {
                        if window.dirty {
                            window.platform_window.invalidate();
                        }
                    }
                }
 
                break;
            }
        }
    }
 
    // Lots more methods...
}

The AppContext::update method does some book-keeping to allow itself to be called reentrantly. Before exiting the topmost call, it calls flush_effects. The flush_effects method is a loop. On every turn, we release dropped entities and focus handles, which drops ownership of resources whose reference count has reached 0. We then remove the next effect from the queue and apply it. If no next effect exists, we iterate over the windows, and for any that are dirty, we invalidate the platform window so it is scheduled to draw on the next frame. We then break the loop.

Next let's use AppContext::update to implement update_model. I'll scaffold it below so we can discuss its signature before proceeding with implementation.

impl AppContext {
    fn update_model<T: 'static, R>(
        &mut self,
        model: &Model<T>,
        update: impl FnOnce(&mut T, &mut ModelContext<'_, T>) -> R,
    ) -> R {
        todo!()
    }
}

The method takes a callback that expects two mutable references, one to the state of the model referenced by the given handle, and a second to a ModelContext, which as I mentioned above, actually just wraps AppContext. Since the AppContext owns the model, this initially seems to require multiple mutable borrows to the same data, which Rust prohibits.

Our workaround is to temporarily "lease" the model state from the AppContext, removing it from the context and moving it to the stack. After we invoke the callback, we end the lease, restoring ownership to the context.

impl AppContext {
    fn update_model<T: 'static, R>(
        &mut self,
        model: &Model<T>,
        update: impl FnOnce(&mut T, &mut ModelContext<'_, T>) -> R,
    ) -> R {
        self.update(|cx| {
            let mut entity = cx.entities.lease(model);
            let result = update(&mut entity, &mut ModelContext::new(cx, model.downgrade()));
            cx.entities.end_lease(entity);
            result
        })
    }
}

This does spell trouble if you ever attempt to update an entity reentrantly, but in practice we've found it quite manageable to avoid this, and it's pretty been quick and easy to detect when we've made errors.

Now that I've covered the basics of how state is managed in GPUI, the next thing to cover is how we present that state on screen with views. But that will have to wait for our next installment. Until then, have a look around our source code and join us live in Zed today for our first Fireside Hack. It happens to be my birthday, and I can't think of a better way to spend it than hanging out in Zed with you.

