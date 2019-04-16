import {
	Component,
	HostBinding,
	Input,
	Output,
	EventEmitter,
	AfterViewInit,
	OnDestroy,
	ViewChild,
	ElementRef
} from "@angular/core";
import { fromEvent, Subscription } from "rxjs";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";

/**
 * Used to select from ranges of values. [See here](https://www.carbondesignsystem.com/components/slider/usage) for usage information.
 *
 * The simplest possible slider usage looks something like:
 * ```html
 * <ibm-slider></ibm-slider>
 * ```
 *
 * That will render a slider without labels or alternative value input. Labels can be provided by
 * elements with `[minLabel]` and `[maxLabel]` attributes, and an `input` (may use the `ibmInput` directive) can be supplied
 * for use as an alternative value field.
 *
 * ex:
 * ```html
 * <!-- full example -->
 * <ibm-slider>
 *		<span minLabel>0GB</span>
 *		<span maxLabel>100GB</span>
 *		<input/>
 *	</ibm-slider>
 * <!-- with just an input -->
 * <ibm-slider>
 *		<input/>
 *	</ibm-slider>
 * <!-- with just one label -->
 * <ibm-slider>
 *		<span maxLabel>Maximum</span>
 *	</ibm-slider>
 * ```
 *
 * Slider supports `NgModel` by default, as well as two way binding to the `value` input.
 */
@Component({
	selector: "ibm-slider",
	template: `
		<ng-container *ngIf="!skeleton; else skeletonTemplate">
			<label [id]="bottomRangeId" class="bx--slider__range-label">
				<ng-content select="[minLabel]"></ng-content>
			</label>
			<div
				class="bx--slider"
				[ngClass]="{'bx--slider--disabled': disabled}">
				<div
					#thumb
					class="bx--slider__thumb"
					tabindex="0"
					[ngStyle]="{'left.%': getFractionComplete() * 100}"
					(mousedown)="onMouseDown($event)"
					(keydown)="onKeyDown($event)">
				</div>
				<div
					#track
					class="bx--slider__track"
					(click)="onClick($event)">
				</div>
				<div
					class="bx--slider__filled-track"
					[ngStyle]="{transform: 'translate(0%, -50%)' + scaleX(getFractionComplete())}">
				</div>
				<input
					#range
					aria-label="slider"
					class="bx--slider__input"
					type="range"
					[step]="step"
					[min]="min"
					[max]="max"
					[value]="value">
			</div>
			<label [id]="topRangeId" class="bx--slider__range-label">
				<ng-content select="[maxLabel]"></ng-content>
			</label>
			<ng-content select="input"></ng-content>
		</ng-container>

		<ng-template #skeletonTemplate>
			<div class="bx--form-item">
				<label class="bx--label bx--skeleton"></label>
				<div class="bx--slider-container bx--skeleton">
					<span class="bx--slider__range-label"></span>
					<div class="bx--slider">
						<div class="bx--slider__thumb"></div>
						<div class="bx--slider__track"></div>
						<div class="bx--slider__filled-track"></div>
					</div>
					<span class="bx--slider__range-label"></span>
				</div>
			</div>
		</ng-template>
	`,
	providers: [
		{
			provide: NG_VALUE_ACCESSOR,
			useExisting: Slider,
			multi: true
		}
	]
})
export class Slider implements AfterViewInit, OnDestroy, ControlValueAccessor {
	/** Used to generate unique IDs */
	private static count = 0;
	/** The lower bound of our range */
	@Input() min = 0;
	/** The upper bound of our range */
	@Input() max = 100;
	/** The interval for our range */
	@Input() step = 1;
	/** Set the initial value. Available for two way binding */
	@Input() set value(v) {
		if (v > this.max) {
			v = this.max;
		}

		if (v < this.min) {
			v = this.min;
		}

		this._value = v;
		this.slidAmount = this.convertToPx(v);

		if (this.input) {
			this.input.value = v.toString();
		}

		this.propagateChange(v);
		this.valueChange.emit(v);
	}

	get value() {
		return this._value;
	}
	/** Base ID for the slider. The min and max labels get IDs `${this.id}-bottom-range` and `${this.id}-top-range` respectively */
	@Input() id = `slider-${Slider.count++}`;
	/** Value used to "multiply" the `step` when using arrow keys to select values */
	@Input() shiftMultiplier = 4;
	/** Set to `true` for a loading slider */
	@Input() skeleton = false;
	/** Set to `true` for a slider without arrow key interactions. */
	@Input() disableArrowKeys = false;
	/** Disables the range visually and functionally */
	@Input() set disabled(v) {
		this._disabled = v;
		// for some reason `this.input` never exists here, so we have to query for it here too
		const input = this.elementRef.nativeElement.querySelector("input:not([type=range])");
		if (input) {
			input.disabled = v;
		}
	}

	get disabled() {
		return this._disabled;
	}
	/** Emits every time a new value is selected */
	@Output() valueChange: EventEmitter<number> = new EventEmitter();
	@HostBinding("class.bx--slider-container") hostClass = true;
	@ViewChild("thumb") thumb: ElementRef;
	@ViewChild("track") track: ElementRef;
	@ViewChild("range") range: ElementRef;

	public bottomRangeId = `${this.id}-bottom-range`;
	public topRangeId = `${this.id}-top-range`;

	protected isMouseDown = false;
	/** Array of event subscriptions so we can batch unsubscribe in `ngOnDestroy` */
	protected eventSubscriptions: Array<Subscription> = [];
	protected slidAmount = 0;
	protected input: HTMLInputElement;
	protected _value = 0;
	protected _disabled = false;

	constructor(protected elementRef: ElementRef) {}

	ngAfterViewInit() {
		// bind mousemove and mouseup to the document so we don't have issues tracking the mouse
		this.eventSubscriptions.push(fromEvent(document, "mousemove").subscribe(this.onMouseMove.bind(this)));
		this.eventSubscriptions.push(fromEvent(document, "mouseup").subscribe(this.onMouseUp.bind(this)));

		// ODO: ontouchstart/ontouchmove/ontouchend

		// set up the optional input
		this.input = this.elementRef.nativeElement.querySelector("input:not([type=range])");
		if (this.input) {
			this.input.type = "number";
			this.input.classList.add("bx--slider-text-input");
			this.input.classList.add("bx--text-input");
			this.input.setAttribute("aria-labelledby", `${this.bottomRangeId} ${this.topRangeId}`);
			this.input.value = this.value.toString();
			// bind events on our optional input
			this.eventSubscriptions.push(fromEvent(this.input, "change").subscribe(this.onChange.bind(this)));
			this.eventSubscriptions.push(fromEvent(this.input, "focus").subscribe(this.onFocus.bind(this)));
		}
	}

	/** Clean up our DOMEvent subscriptions */
	ngOnDestroy() {
		this.eventSubscriptions.forEach(subscription => {
			subscription.unsubscribe();
		});
	}

	/** Send changes back to the model */
	propagateChange = (_: any) => { };

	/** Register a change propagation function for `ControlValueAccessor` */
	registerOnChange(fn: any) {
		this.propagateChange = fn;
	}

	/** Callback to notify the model when our input has been touched */
	onTouched: () => any = () => { };

	/** Register a callback to notify when our input has been touched */
	registerOnTouched(fn: any) {
		this.onTouched = fn;
	}

	/** Receives a value from the model */
	writeValue(v: any) {
		this.value = v;
	}

	/** Returns the amount of "completeness" as a fraction of the total track width */
	getFractionComplete() {
		if (!this.track) {
			return 0;
		}

		const trackWidth = this.track.nativeElement.getBoundingClientRect().width;
		return this.slidAmount / trackWidth;
	}

	/** Helper function to return the CSS transform `scaleX` function */
	scaleX(complete) {
		return `scaleX(${complete})`;
	}

	/** Converts a given px value to a "real" value in our range */
	convertToValue(pxAmount) {
		// basic concept borrowed from carbon-components
		// ref: https://github.com/IBM/carbon-components/blob/43bf3abdc2f8bdaa38aa84e0f733adde1e1e8894/src/components/slider/slider.js#L147-L151
		const range = this.max - this.min;
		const trackWidth = this.track.nativeElement.getBoundingClientRect().width;
		const unrounded = pxAmount / trackWidth;
		const rounded = Math.round((range * unrounded) / this.step) * this.step;
		return rounded + this.min;
	}

	/** Converts a given "real" value to a px value we can update the view with */
	convertToPx(value) {
		if (!this.track) {
			return 0;
		}

		const trackWidth = this.track.nativeElement.getBoundingClientRect().width;
		if (value >= this.max) {
			return trackWidth;
		}

		if (value <= this.min) {
			return 0;
		}

		return Math.round(trackWidth * (value / this.max));
	}

	/**
	 * Increments the value by the step value, or the step value multiplied by the `multiplier` argument.
	 *
	 * @argument multiplier Defaults to `1`, multiplied with the step value.
	 */
	incrementValue(multiplier = 1) {
		this.value = this.value + (this.step * multiplier);
	}

	/**
	 * Decrements the value by the step value, or the step value multiplied by the `multiplier` argument.
	 *
	 * @argument multiplier Defaults to `1`, multiplied with the step value.
	 */
	decrementValue(multiplier = 1) {
		this.value = this.value - (this.step * multiplier);
	}

	/** Change handler for the optional input */
	onChange(event) {
		this.value = event.target.value;
	}

	/** Handles clicks on the range track, and setting the value to it's "real" equivalent */
	onClick(event) {
		if (this.disabled) { return; }
		const trackLeft = this.track.nativeElement.getBoundingClientRect().left;
		this.value = this.convertToValue(event.clientX - trackLeft);
	}

	/** Focus handler for the optional input */
	onFocus({target}) {
		target.select();
	}

	/** Mouse move handler. Responsible for updating the value and visual selection based on mouse movement */
	onMouseMove(event) {
		if (this.disabled || !this.isMouseDown) { return; }
		const track = this.track.nativeElement.getBoundingClientRect();
		if (
			event.clientX - track.left <= track.width
			&& event.clientX - track.left >= 0
		) {
			this.slidAmount = event.clientX - track.left;
		}
		this.value = this.convertToValue(this.slidAmount);
	}

	/** Enables the `onMouseMove` handler */
	onMouseDown(event) {
		event.preventDefault();
		if (this.disabled) { return; }
		this.thumb.nativeElement.focus();
		this.isMouseDown = true;
	}

	/** Disables the `onMouseMove` handler */
	onMouseUp() {
		this.isMouseDown = false;
	}

	/** Calls `incrementValue` for ArrowRight and ArrowUp, `decrementValue` for ArrowLeft and ArrowDown */
	onKeyDown(event: KeyboardEvent) {
		if (this.disableArrowKeys) {
			return;
		}
		event.preventDefault();
		const multiplier = event.shiftKey ? this.shiftMultiplier : 1;
		if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
			this.decrementValue(multiplier);
		}

		if (event.key === "ArrowRight" || event.key === "ArrowUp") {
			this.incrementValue(multiplier);
		}
	}
}
