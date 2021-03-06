import { InstrumentationBase } from '@opentelemetry/instrumentation';
import { EventName, UserInteractionInstrumentationConfig, ZoneTypeWithPrototype } from './types';
/**
 * This class represents a UserInteraction plugin for auto instrumentation.
 * If zone.js is available then it patches the zone otherwise it patches
 * addEventListener of HTMLElement
 */
export declare class UserInteractionInstrumentation extends InstrumentationBase<unknown> {
    readonly component: string;
    readonly version = "0.1.1";
    moduleName: string;
    private _spansData;
    private _zonePatched?;
    private _wrappedListeners;
    private _eventsSpanMap;
    private _eventNames;
    private _shouldPreventSpanCreation;
    constructor(config?: UserInteractionInstrumentationConfig);
    init(): void;
    /**
     * This will check if last task was timeout and will save the time to
     * fix the user interaction when nothing happens
     * This timeout comes from xhr plugin which is needed to collect information
     * about last xhr main request from observer
     * @param task
     * @param span
     */
    private _checkForTimeout;
    /**
     * Controls whether or not to create a span, based on the event type.
     */
    protected _allowEventName(eventName: EventName): boolean;
    /**
     * Creates a new span
     * @param element
     * @param eventName
     */
    private _createSpan;
    /**
     * Decrement number of tasks that left in zone,
     * This is needed to be able to end span when no more tasks left
     * @param span
     */
    private _decrementTask;
    /**
     * Return the current span
     * @param zone
     * @private
     */
    private _getCurrentSpan;
    /**
     * Increment number of tasks that are run within the same zone.
     *     This is needed to be able to end span when no more tasks left
     * @param span
     */
    private _incrementTask;
    /**
     * Returns true iff we should use the patched callback; false if it's already been patched
     */
    private addPatchedListener;
    /**
     * Returns the patched version of the callback (or undefined)
     */
    private removePatchedListener;
    private _invokeListener;
    /**
     * This patches the addEventListener of HTMLElement to be able to
     * auto instrument the click events
     * This is done when zone is not available
     */
    private _patchAddEventListener;
    /**
     * This patches the removeEventListener of HTMLElement to handle the fact that
     * we patched the original callbacks
     * This is done when zone is not available
     */
    private _patchRemoveEventListener;
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
    private _getPatchableEventTargets;
    /**
     * Patches the history api
     */
    _patchHistoryApi(): void;
    /**
     * Patches the certain history api method
     */
    _patchHistoryMethod(): (original: any) => (this: History, ...args: unknown[]) => any;
    /**
     * unpatch the history api methods
     */
    _unpatchHistoryApi(): void;
    /**
     * Updates interaction span name
     * @param url
     */
    _updateInteractionName(url: string): void;
    /**
     * Patches zone cancel task - this is done to be able to correctly
     * decrement the number of remaining tasks
     */
    private _patchZoneCancelTask;
    /**
     * Patches zone schedule task - this is done to be able to correctly
     * increment the number of tasks running within current zone but also to
     * save time in case of timeout running from xhr plugin when waiting for
     * main request from PerformanceResourceTiming
     */
    private _patchZoneScheduleTask;
    /**
     * Patches zone run task - this is done to be able to create a span when
     * user interaction starts
     * @private
     */
    private _patchZoneRunTask;
    /**
     * Decides if task should be counted.
     * @param task
     * @param currentZone
     * @private
     */
    private _shouldCountTask;
    /**
     * Will try to end span when such span still exists.
     * @param span
     * @param endTime
     * @private
     */
    private _tryToEndSpan;
    /**
     * implements enable function
     */
    enable(): void;
    /**
     * implements unpatch function
     */
    disable(): void;
    /**
     * returns Zone
     */
    getZoneWithPrototype(): ZoneTypeWithPrototype | undefined;
}
//# sourceMappingURL=instrumentation.d.ts.map