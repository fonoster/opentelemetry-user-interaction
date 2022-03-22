"use strict";
/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserInteractionInstrumentation = void 0;
const instrumentation_1 = require("@opentelemetry/instrumentation");
const api = require("@opentelemetry/api");
const core_1 = require("@opentelemetry/core");
const sdk_trace_web_1 = require("@opentelemetry/sdk-trace-web");
const AttributeNames_1 = require("./enums/AttributeNames");
const VERSION = "0.1.1";
const ZONE_CONTEXT_KEY = 'OT_ZONE_CONTEXT';
const EVENT_NAVIGATION_NAME = 'Navigation:';
const DEFAULT_EVENT_NAMES = ['click'];
function defaultShouldPreventSpanCreation() {
    return false;
}
/**
 * This class represents a UserInteraction plugin for auto instrumentation.
 * If zone.js is available then it patches the zone otherwise it patches
 * addEventListener of HTMLElement
 */
class UserInteractionInstrumentation extends instrumentation_1.InstrumentationBase {
    constructor(config) {
        var _a;
        super('@opentelemetry/instrumentation-user-interaction', VERSION, config);
        this.component = 'user-interaction';
        this.version = VERSION;
        this.moduleName = this.component;
        this._spansData = new WeakMap();
        // for addEventListener/removeEventListener state
        this._wrappedListeners = new WeakMap();
        // for event bubbling
        this._eventsSpanMap = new WeakMap();
        this._eventNames = new Set((_a = config === null || config === void 0 ? void 0 : config.eventNames) !== null && _a !== void 0 ? _a : DEFAULT_EVENT_NAMES);
        this._shouldPreventSpanCreation =
            typeof (config === null || config === void 0 ? void 0 : config.shouldPreventSpanCreation) === 'function'
                ? config.shouldPreventSpanCreation
                : defaultShouldPreventSpanCreation;
    }
    init() { }
    /**
     * This will check if last task was timeout and will save the time to
     * fix the user interaction when nothing happens
     * This timeout comes from xhr plugin which is needed to collect information
     * about last xhr main request from observer
     * @param task
     * @param span
     */
    _checkForTimeout(task, span) {
        const spanData = this._spansData.get(span);
        if (spanData) {
            if (task.source === 'setTimeout') {
                spanData.hrTimeLastTimeout = core_1.hrTime();
            }
            else if (task.source !== 'Promise.then' &&
                task.source !== 'setTimeout') {
                spanData.hrTimeLastTimeout = undefined;
            }
        }
    }
    /**
     * Controls whether or not to create a span, based on the event type.
     */
    _allowEventName(eventName) {
        return this._eventNames.has(eventName);
    }
    /**
     * Creates a new span
     * @param element
     * @param eventName
     */
    _createSpan(element, eventName, parentSpan) {
        var _a, _b, _c, _d;
        if (!(element instanceof HTMLElement)) {
            return undefined;
        }
        if (!element.getAttribute) {
            return undefined;
        }
        if (element.hasAttribute('disabled')) {
            return undefined;
        }
        if (!this._allowEventName(eventName)) {
            return undefined;
        }
        const xpath = sdk_trace_web_1.getElementXPath(element, true);
        try {
            const data = JSON.stringify({
                id: element.getAttribute('id') || element.getAttribute('data-id') || ((_a = element.parentElement) === null || _a === void 0 ? void 0 : _a.getAttribute('data-id')),
                elementText: element.textContent || ((_b = element.parentElement) === null || _b === void 0 ? void 0 : _b.textContent),
                description: element.getAttribute('data-desc') || ((_c = element.parentElement) === null || _c === void 0 ? void 0 : _c.getAttribute('data-desc')),
                actionIntent: element.getAttribute('data-intent') || ((_d = element.parentElement) === null || _d === void 0 ? void 0 : _d.getAttribute('data-intent')),
            });
            const span = this.tracer.startSpan(eventName, {
                attributes: {
                    [AttributeNames_1.AttributeNames.DATA]: data,
                    [AttributeNames_1.AttributeNames.EVENT_TYPE]: eventName,
                    [AttributeNames_1.AttributeNames.TARGET_ELEMENT]: element.tagName,
                    [AttributeNames_1.AttributeNames.TARGET_XPATH]: xpath,
                    [AttributeNames_1.AttributeNames.HTTP_URL]: window.location.href,
                    [AttributeNames_1.AttributeNames.HTTP_USER_AGENT]: navigator.userAgent,
                },
            }, parentSpan
                ? api.trace.setSpan(api.context.active(), parentSpan)
                : undefined);
            if (this._shouldPreventSpanCreation(eventName, element, span) === true) {
                return undefined;
            }
            this._spansData.set(span, {
                taskCount: 0,
            });
            return span;
        }
        catch (e) {
            api.diag.error(this.component, e);
        }
        return undefined;
    }
    /**
     * Decrement number of tasks that left in zone,
     * This is needed to be able to end span when no more tasks left
     * @param span
     */
    _decrementTask(span) {
        const spanData = this._spansData.get(span);
        if (spanData) {
            spanData.taskCount--;
            if (spanData.taskCount === 0) {
                this._tryToEndSpan(span, spanData.hrTimeLastTimeout);
            }
        }
    }
    /**
     * Return the current span
     * @param zone
     * @private
     */
    _getCurrentSpan(zone) {
        const context = zone.get(ZONE_CONTEXT_KEY);
        if (context) {
            return api.trace.getSpan(context);
        }
        return context;
    }
    /**
     * Increment number of tasks that are run within the same zone.
     *     This is needed to be able to end span when no more tasks left
     * @param span
     */
    _incrementTask(span) {
        const spanData = this._spansData.get(span);
        if (spanData) {
            spanData.taskCount++;
        }
    }
    /**
     * Returns true iff we should use the patched callback; false if it's already been patched
     */
    addPatchedListener(on, type, listener, wrappedListener) {
        let listener2Type = this._wrappedListeners.get(listener);
        if (!listener2Type) {
            listener2Type = new Map();
            this._wrappedListeners.set(listener, listener2Type);
        }
        let element2patched = listener2Type.get(type);
        if (!element2patched) {
            element2patched = new Map();
            listener2Type.set(type, element2patched);
        }
        if (element2patched.has(on)) {
            return false;
        }
        element2patched.set(on, wrappedListener);
        return true;
    }
    /**
     * Returns the patched version of the callback (or undefined)
     */
    removePatchedListener(on, type, listener) {
        const listener2Type = this._wrappedListeners.get(listener);
        if (!listener2Type) {
            return undefined;
        }
        const element2patched = listener2Type.get(type);
        if (!element2patched) {
            return undefined;
        }
        const patched = element2patched.get(on);
        if (patched) {
            element2patched.delete(on);
            if (element2patched.size === 0) {
                listener2Type.delete(type);
                if (listener2Type.size === 0) {
                    this._wrappedListeners.delete(listener);
                }
            }
        }
        return patched;
    }
    // utility method to deal with the Function|EventListener nature of addEventListener
    _invokeListener(listener, target, args) {
        if (typeof listener === 'function') {
            return listener.apply(target, args);
        }
        else {
            return listener.handleEvent(args[0]);
        }
    }
    /**
     * This patches the addEventListener of HTMLElement to be able to
     * auto instrument the click events
     * This is done when zone is not available
     */
    _patchAddEventListener() {
        const plugin = this;
        return (original) => {
            return function addEventListenerPatched(type, listener, useCapture) {
                // Forward calls with listener = null
                if (!listener) {
                    return original.call(this, type, listener, useCapture);
                }
                const once = typeof useCapture === 'object' && useCapture.once;
                const patchedListener = function (...args) {
                    let parentSpan;
                    const event = args[0];
                    const target = event === null || event === void 0 ? void 0 : event.target;
                    if (event) {
                        parentSpan = plugin._eventsSpanMap.get(event);
                    }
                    if (once) {
                        plugin.removePatchedListener(this, type, listener);
                    }
                    const span = plugin._createSpan(target, type, parentSpan);
                    if (span) {
                        if (event) {
                            plugin._eventsSpanMap.set(event, span);
                        }
                        return api.context.with(api.trace.setSpan(api.context.active(), span), () => {
                            const result = plugin._invokeListener(listener, this, args);
                            // no zone so end span immediately
                            span.end();
                            return result;
                        });
                    }
                    else {
                        return plugin._invokeListener(listener, this, args);
                    }
                };
                if (plugin.addPatchedListener(this, type, listener, patchedListener)) {
                    return original.call(this, type, patchedListener, useCapture);
                }
            };
        };
    }
    /**
     * This patches the removeEventListener of HTMLElement to handle the fact that
     * we patched the original callbacks
     * This is done when zone is not available
     */
    _patchRemoveEventListener() {
        const plugin = this;
        return (original) => {
            return function removeEventListenerPatched(type, listener, useCapture) {
                const wrappedListener = plugin.removePatchedListener(this, type, listener);
                if (wrappedListener) {
                    return original.call(this, type, wrappedListener, useCapture);
                }
                else {
                    return original.call(this, type, listener, useCapture);
                }
            };
        };
    }
    /**
     * Most browser provide event listener api via EventTarget in prototype chain.
     * Exception to this is IE 11 which has it on the prototypes closest to EventTarget:
     *
     * * - has addEventListener in IE
     * ** - has addEventListener in all other browsers
     * ! - missing in IE
     *
     * HTMLElement -> Element -> Node * -> EventTarget **! -> Object
     * Document -> Node * -> EventTarget **! -> Object
     * Window * -> WindowProperties ! -> EventTarget **! -> Object
     */
    _getPatchableEventTargets() {
        return window.EventTarget
            ? [EventTarget.prototype]
            : [Node.prototype, Window.prototype];
    }
    /**
     * Patches the history api
     */
    _patchHistoryApi() {
        this._unpatchHistoryApi();
        this._wrap(history, 'replaceState', this._patchHistoryMethod());
        this._wrap(history, 'pushState', this._patchHistoryMethod());
        this._wrap(history, 'back', this._patchHistoryMethod());
        this._wrap(history, 'forward', this._patchHistoryMethod());
        this._wrap(history, 'go', this._patchHistoryMethod());
    }
    /**
     * Patches the certain history api method
     */
    _patchHistoryMethod() {
        const plugin = this;
        return (original) => {
            return function patchHistoryMethod(...args) {
                const url = `${location.pathname}${location.hash}${location.search}`;
                const result = original.apply(this, args);
                const urlAfter = `${location.pathname}${location.hash}${location.search}`;
                if (url !== urlAfter) {
                    plugin._updateInteractionName(urlAfter);
                }
                return result;
            };
        };
    }
    /**
     * unpatch the history api methods
     */
    _unpatchHistoryApi() {
        if (instrumentation_1.isWrapped(history.replaceState))
            this._unwrap(history, 'replaceState');
        if (instrumentation_1.isWrapped(history.pushState))
            this._unwrap(history, 'pushState');
        if (instrumentation_1.isWrapped(history.back))
            this._unwrap(history, 'back');
        if (instrumentation_1.isWrapped(history.forward))
            this._unwrap(history, 'forward');
        if (instrumentation_1.isWrapped(history.go))
            this._unwrap(history, 'go');
    }
    /**
     * Updates interaction span name
     * @param url
     */
    _updateInteractionName(url) {
        const span = api.trace.getSpan(api.context.active());
        if (span && typeof span.updateName === 'function') {
            span.updateName(`${EVENT_NAVIGATION_NAME} ${url}`);
        }
    }
    /**
     * Patches zone cancel task - this is done to be able to correctly
     * decrement the number of remaining tasks
     */
    _patchZoneCancelTask() {
        const plugin = this;
        return (original) => {
            return function patchCancelTask(task) {
                const currentZone = Zone.current;
                const currentSpan = plugin._getCurrentSpan(currentZone);
                if (currentSpan && plugin._shouldCountTask(task, currentZone)) {
                    plugin._decrementTask(currentSpan);
                }
                return original.call(this, task);
            };
        };
    }
    /**
     * Patches zone schedule task - this is done to be able to correctly
     * increment the number of tasks running within current zone but also to
     * save time in case of timeout running from xhr plugin when waiting for
     * main request from PerformanceResourceTiming
     */
    _patchZoneScheduleTask() {
        const plugin = this;
        return (original) => {
            return function patchScheduleTask(task) {
                const currentZone = Zone.current;
                const currentSpan = plugin._getCurrentSpan(currentZone);
                if (currentSpan && plugin._shouldCountTask(task, currentZone)) {
                    plugin._incrementTask(currentSpan);
                    plugin._checkForTimeout(task, currentSpan);
                }
                return original.call(this, task);
            };
        };
    }
    /**
     * Patches zone run task - this is done to be able to create a span when
     * user interaction starts
     * @private
     */
    _patchZoneRunTask() {
        const plugin = this;
        return (original) => {
            return function patchRunTask(task, applyThis, applyArgs) {
                const event = Array.isArray(applyArgs) && applyArgs[0] instanceof Event
                    ? applyArgs[0]
                    : undefined;
                const target = event === null || event === void 0 ? void 0 : event.target;
                let span;
                const activeZone = this;
                if (target) {
                    span = plugin._createSpan(target, task.eventName);
                    if (span) {
                        plugin._incrementTask(span);
                        return activeZone.run(() => {
                            try {
                                return api.context.with(api.trace.setSpan(api.context.active(), span), () => {
                                    const currentZone = Zone.current;
                                    task._zone = currentZone;
                                    return original.call(currentZone, task, applyThis, applyArgs);
                                });
                            }
                            finally {
                                plugin._decrementTask(span);
                            }
                        });
                    }
                }
                else {
                    span = plugin._getCurrentSpan(activeZone);
                }
                try {
                    return original.call(activeZone, task, applyThis, applyArgs);
                }
                finally {
                    if (span && plugin._shouldCountTask(task, activeZone)) {
                        plugin._decrementTask(span);
                    }
                }
            };
        };
    }
    /**
     * Decides if task should be counted.
     * @param task
     * @param currentZone
     * @private
     */
    _shouldCountTask(task, currentZone) {
        if (task._zone) {
            currentZone = task._zone;
        }
        if (!currentZone || !task.data || task.data.isPeriodic) {
            return false;
        }
        const currentSpan = this._getCurrentSpan(currentZone);
        if (!currentSpan) {
            return false;
        }
        if (!this._spansData.get(currentSpan)) {
            return false;
        }
        return task.type === 'macroTask' || task.type === 'microTask';
    }
    /**
     * Will try to end span when such span still exists.
     * @param span
     * @param endTime
     * @private
     */
    _tryToEndSpan(span, endTime) {
        if (span) {
            const spanData = this._spansData.get(span);
            if (spanData) {
                span.end(endTime);
                this._spansData.delete(span);
            }
        }
    }
    /**
     * implements enable function
     */
    enable() {
        const ZoneWithPrototype = this.getZoneWithPrototype();
        api.diag.debug('applying patch to', this.moduleName, this.version, 'zone:', !!ZoneWithPrototype);
        if (ZoneWithPrototype) {
            if (instrumentation_1.isWrapped(ZoneWithPrototype.prototype.runTask)) {
                this._unwrap(ZoneWithPrototype.prototype, 'runTask');
                api.diag.debug('removing previous patch from method runTask');
            }
            if (instrumentation_1.isWrapped(ZoneWithPrototype.prototype.scheduleTask)) {
                this._unwrap(ZoneWithPrototype.prototype, 'scheduleTask');
                api.diag.debug('removing previous patch from method scheduleTask');
            }
            if (instrumentation_1.isWrapped(ZoneWithPrototype.prototype.cancelTask)) {
                this._unwrap(ZoneWithPrototype.prototype, 'cancelTask');
                api.diag.debug('removing previous patch from method cancelTask');
            }
            this._zonePatched = true;
            this._wrap(ZoneWithPrototype.prototype, 'runTask', this._patchZoneRunTask());
            this._wrap(ZoneWithPrototype.prototype, 'scheduleTask', this._patchZoneScheduleTask());
            this._wrap(ZoneWithPrototype.prototype, 'cancelTask', this._patchZoneCancelTask());
        }
        else {
            this._zonePatched = false;
            const targets = this._getPatchableEventTargets();
            targets.forEach(target => {
                if (instrumentation_1.isWrapped(target.addEventListener)) {
                    this._unwrap(target, 'addEventListener');
                    api.diag.debug('removing previous patch from method addEventListener');
                }
                if (instrumentation_1.isWrapped(target.removeEventListener)) {
                    this._unwrap(target, 'removeEventListener');
                    api.diag.debug('removing previous patch from method removeEventListener');
                }
                this._wrap(target, 'addEventListener', this._patchAddEventListener());
                this._wrap(target, 'removeEventListener', this._patchRemoveEventListener());
            });
        }
        this._patchHistoryApi();
    }
    /**
     * implements unpatch function
     */
    disable() {
        const ZoneWithPrototype = this.getZoneWithPrototype();
        api.diag.debug('removing patch from', this.moduleName, this.version, 'zone:', !!ZoneWithPrototype);
        if (ZoneWithPrototype && this._zonePatched) {
            if (instrumentation_1.isWrapped(ZoneWithPrototype.prototype.runTask)) {
                this._unwrap(ZoneWithPrototype.prototype, 'runTask');
            }
            if (instrumentation_1.isWrapped(ZoneWithPrototype.prototype.scheduleTask)) {
                this._unwrap(ZoneWithPrototype.prototype, 'scheduleTask');
            }
            if (instrumentation_1.isWrapped(ZoneWithPrototype.prototype.cancelTask)) {
                this._unwrap(ZoneWithPrototype.prototype, 'cancelTask');
            }
        }
        else {
            const targets = this._getPatchableEventTargets();
            targets.forEach(target => {
                if (instrumentation_1.isWrapped(target.addEventListener)) {
                    this._unwrap(target, 'addEventListener');
                }
                if (instrumentation_1.isWrapped(target.removeEventListener)) {
                    this._unwrap(target, 'removeEventListener');
                }
            });
        }
        this._unpatchHistoryApi();
    }
    /**
     * returns Zone
     */
    getZoneWithPrototype() {
        const _window = window;
        return _window.Zone;
    }
}
exports.UserInteractionInstrumentation = UserInteractionInstrumentation;
//# sourceMappingURL=instrumentation.js.map