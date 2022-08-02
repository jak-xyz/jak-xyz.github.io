var tweak = {};

(function tweak_js() {

//-----------------------------------------------------------------------------
// Constants that must be kept in sync with C++
const Tweak_Group = 1;
const Tweak_Checkboxes = 2;
const Tweak_RadioButtons = 3;
const Tweak_Dropdown = 4;
const Tweak_RangeWithTextField = 5;
const Tweak_Button = 6;

const RangeMappingType_Direct = 0;
const RangeMappingType_Linear = 1;
const RangeMappingType_Power = 2;
const RangeMappingType_Exponential = 3;

const Type_Unknown = 0;
const Type_Float = 1;
const Type_Uint32 = 2;

//-----------------------------------------------------------------------------
// Global tweak UI object tracking and helpers
var version = 1;
var containerPtrs = [0, 0];
var containers = [{}, {}];
function storeTweaks() {
	let stripped = [{}, {}];
	for (let k in containers[0]) {
		if (!(containers[0][k].offset >= 0)) { continue; }
		stripped[0][k] = containers[0][k].value;
		stripped[1][k] = containers[1][k].value;
	}
	window.localStorage.setItem(`tweaks_v${version}`, JSON.stringify(stripped));
}
function loadTweaks() {
	let strippedJson = localStorage.getItem(`tweaks_v${version}`);
	if (!strippedJson) { return; }
	let stripped = JSON.parse(strippedJson);
	for (let k in stripped[0]) {
		containers[0][k] = { type: Type_Unknown, value: stripped[0][k], offset: -1, shift: 0, mask: 0 };
		containers[1][k] = { type: Type_Unknown, value: stripped[1][k], offset: -1, shift: 0, mask: 0 };
	}
}

var controls = [];
var controlGroups = [];
function setMode(mode) {
	let select = document.getElementById('mode-select');
	select.value = 31 - Math.clz32(mode);
	let showRightSide = mode == Demo_Sim;
	for (let i = 0; i < controls.length; i++) {
		controls[i].control.style.display = (controls[i].modeMask & mode) ? 'flex' : 'none';
		let inputArea = controls[i].control.querySelector('.control-input-area');
		for (let j = 1; j < inputArea.childNodes.length; j++) {
			inputArea.childNodes[j].style.visibility = showRightSide ? 'visible' : 'hidden';
		}
	}
	for (let i = 0; i < controlGroups.length; i++) {
		controlGroups[i].group.style.display = (controlGroups[i].modeMask & mode) ? 'flex' : 'none';
		if (controlGroups[i].group.style.display == 'flex') {
			controlGroupUpdateLabel(controlGroups[i].group);
		}
	}
	rpc('SetMode', mode);
}

var links = [];
function toggleAllLinks(skip) {
	if (typeof skip !== 'number') {
		skip = 0;
	}
	let target = !links[skip].linkCheckbox.checked;
	for (let i = skip; i < links.length; i++) {
		links[i].linkCheckbox.checked = target;
		links[i].linkCheckbox.dispatchEvent(new Event('change'));
	}
}

function resetTweaks() {
	localStorage.removeItem(`tweaks_v${version}`);
	localStorage.removeItem('collapsedControlGroups');
	location.reload();
}

//-----------------------------------------------------------------------------
// General DOM manipulation helpers
function addElement(parentElement, type, className) {
	let element = document.createElement(type);
	if (className) {
		element.className = className;
	}
	parentElement.appendChild(element);
	return element;
}
function addLabel(parentElement, className, text) {
	let label = addElement(parentElement, 'label', className);
	label.innerHTML = text;
	return label;
}
function addInput(parentElement, className, type) {
	let input = addElement(parentElement, 'input', className);
	input.type = type;
	return input;
}

//-----------------------------------------------------------------------------
// UI element classes
class CheckboxControl {
	constructor(parentElement, name, flags, labels) {
		console.assert(flags.length == labels.length);
		this.name = name;
		this.flags = flags;
		this.onchange = null;

		this.rootElement = addElement(parentElement, 'div', 'control-input-bag');
		let row = addElement(this.rootElement, 'div', 'control-input-bag-row');
		this.checkboxes = [];
		for (let i = 0; i < flags.length; i++) {
			let labelNode = addLabel(row, 'control-input-bag-contents', labels[i]);
			let checkbox = addInput(labelNode, '', 'checkbox');
			checkbox.addEventListener('change', () => {
				if (this.onchange) { this.onchange(); }
			});
			this.checkboxes[i] = checkbox;
		}
	}
	storeState() {
		let state = [];
		for (let i = 0; i < this.checkboxes.length; i++) {
			state[i] = this.checkboxes[i].checked;
		}
		return state;
	}
	loadState(state) {
		for (let i = 0; i < this.checkboxes.length; i++) {
			this.checkboxes[i].checked = state[i];
		}
	}
	storeToContainer(container) {
		let changed = false;
		for (let i = 0; i < this.checkboxes.length; i++) {
			if (this.checkboxes[i].checked != !!(container[this.name].value & this.flags[i])) { changed = true; }
			if (this.checkboxes[i].checked) {
				container[this.name].value |= this.flags[i];
			} else {
				container[this.name].value &= ~this.flags[i];
			}
		}
		return changed;
	}
	loadFromContainer(container) {
		let changed = false;
		for (let i = 0; i < this.checkboxes.length; i++) {
			if (this.checkboxes[i].checked != !!(container[this.name].value & this.flags[i])) { changed = true; }
			this.checkboxes[i].checked = !!(container[this.name].value & this.flags[i]);
		}
		return changed;
	}
}

class RadioButtonsControl {
	constructor(parentElement, name, side, labels) {
		this.name = name;
		this.onchange = null;

		this.rootElement = addElement(parentElement, 'div', 'control-input-bag');
		this.buttons = [];
		labels.forEach(labelRow => {
			let row = addElement(this.rootElement, 'div', 'control-input-bag-row');
			labelRow.forEach(label => {
				let labelNode = addLabel(row, 'control-input-bag-contents', label);
				let button = addInput(labelNode, '', 'radio');
				button.name = `${name}${side}`;
				button.value = this.buttons.length;
				button.addEventListener('change', () => {
					if (this.onchange) { this.onchange(); }
				});
				this.buttons.push(button);
			});
		});
	}
	storeState() {
		for (let i = 0; i < this.buttons.length; i++) {
			if (this.buttons[i].checked) { return i; }
		}
		return 0;
	}
	loadState(state) {
		this.buttons[state].checked = true;
	}
	storeToContainer(container) {
		let changed = !this.buttons[container[this.name].value].checked;
		for (let i = 0; i < this.buttons.length; i++) {
			if (this.buttons[i].checked) {
				container[this.name].value = i;
				break;
			}
		}
		return changed;
	}
	loadFromContainer(container) {
		let changed = !this.buttons[container[this.name].value].checked;
		this.buttons[container[this.name].value].checked = true;
		return changed;
	}
}

class DropdownControl {
	constructor(parentElement, name, side, options) {
		this.name = name;
		this.onchange = null;

		this.rootElement = addElement(parentElement, 'div', 'control-input-dropdown');
		this.labelNode = addLabel(this.rootElement, 'control-input-dropdown', '');
		this.selectNode = addElement(this.labelNode, 'select', 'control-select');
		this.selectNode.name = `${name}${side}`;
		this.selectNode.size = 1;

		let yOffset0 = 0, yOffset = 0;
		let keepOnScreen = () => {
			if (this.selectNode.size > 1) {
				let brect = this.selectNode.getBoundingClientRect();
				yOffset = Math.min(yOffset0, yOffset + window.innerHeight - brect.bottom);
				this.selectNode.style.top = yOffset+'px';
			}
		};
		let wasTouched = false;
		let overMe = false;
		let originalValue = 1;
		this.selectNode.addEventListener('touchend', () => {
			wasTouched = true;
		});
		this.selectNode.addEventListener('mousedown', () => {
			if (wasTouched) { wasTouched = false; return; }

			if (this.selectNode.size == 1) {
				this.selectNode.size = options.length;
				let optionHeight = this.selectNode.firstChild.clientHeight;
				yOffset0 = -optionHeight * this.selectNode.value;
				yOffset = 0;
				keepOnScreen();
				originalValue = this.selectNode.value;
			}
			overMe = true;
		});
		window.addEventListener('mousedown', () => {
			if (!overMe) {
				this.selectNode.style.top = '0em';
				this.selectNode.size = 1;
			}
			overMe = false;
		});
		document.addEventListener('keydown', (event) => {
			if (event.key === 'Escape' && this.selectNode.size > 1) {
				this.selectNode.value = originalValue;
				if (this.onchange) { this.onchange(); }
				this.selectNode.style.top = '0em';
				this.selectNode.size = 1;
			}
		});
		this.selectNode.addEventListener('mouseover', keepOnScreen);
		window.addEventListener("scroll", keepOnScreen);
		this.selectNode.addEventListener('mouseleave', () => {
			if (this.selectNode.size > 1) {
				this.selectNode.value = originalValue;
				if (this.onchange) { this.onchange(); }
			}
		});

		for (let i = 0; i < options.length; i++) {
			let option = options[i];
			let optionNode = addElement(this.selectNode, 'option', 'control-option');
			optionNode.value = ''+i;
			optionNode.innerHTML = option;
			optionNode.addEventListener('mouseover', () => {
				this.selectNode.value = optionNode.value;
				if (this.onchange) { this.onchange(); }
			});
			optionNode.addEventListener('click', () => {
				this.selectNode.style.top = '0em';
				this.selectNode.size = 1;
			});
		}
		this.selectNode.addEventListener('change', () => {
			if (this.onchange) { this.onchange(); }
		});
		// This allows the select node to appear centered in the control row while
		// still expanding downward, as expected
		let rect = this.selectNode.getBoundingClientRect();
		this.labelNode.style.height = rect.height+'px';
	}
	storeState() {
		return this.selectNode.value;
	}
	loadState(state) {
		this.selectNode.value = state;
	}
	storeToContainer(container) {
		let changed = this.selectNode.value != container[this.name].value;
		container[this.name].value = this.selectNode.value;
		return changed;
	}
	loadFromContainer(container) {
		let changed = this.selectNode.value != container[this.name].value;
		this.selectNode.value = container[this.name].value;
		return changed;
	}
}

class RangeWithTextFieldControl {
	constructor(parentElement, name, min, max, step, rangeToTextValueFn) {
		this.name = name;
		this.value = 0.0;
		this.onchange = null;

		this.rootElement = addElement(parentElement, 'div', 'control-input-slider');
		let label0 = addLabel(this.rootElement, 'control-input-slider', '');
		this.range = addInput(label0, 'control-range', 'range');
		this.range.min = min;
		this.range.max = max;
		this.range.step = step || 'any';
		this.range.value = this.value;
		let label1 = addLabel(this.rootElement, '', '');
		this.text = addInput(label1, 'control-range-text', 'text');
		this.text.value = rangeToTextValueFn(this.value);

		this.formatValueForText = (value) => {
			const SIG_FIG = 3;

			if (Math.abs(value) < 0.00001) { return '0'; } // Text box can't display really small values, anyway

			let optionalMinus = value < 0 ? '-' : '';
			value = Math.abs(value);

			let leftDigit = Math.floor(Math.log10(value));
			let figs = Math.round(value / 10.0 ** (leftDigit - SIG_FIG + 1));
			if (leftDigit >= SIG_FIG - 1) {
				// No significant figures to the right of the decimal point
				return optionalMinus + figs.toString() + '0'.repeat(leftDigit - (SIG_FIG - 1));
			} else {
				// At least some sig figs to the right of the decimal point
				let fixed = (figs * 10.0 ** (leftDigit - SIG_FIG + 1)).toFixed(-leftDigit + SIG_FIG - 1);
				let chopped = fixed.replace(/\.?0+$/, ''); // Remove trailing zeroes and '.'
				return optionalMinus + chopped;
			}
		};
		this.searchValueForRange = (value) => {
			let low = min;
			let high = max;
			let guess = 0.5 * (low + high);
			for (let itr = 0; itr < 32; itr++) {
				let guessVal = parseFloat(rangeToTextValueFn(guess));
				if (value < guessVal) {
					high = guess;
				} else if (value > guessVal) {
					low = guess;
				} else {
					break;
                }
				guess = 0.5 * (low + high);
			}
			return guess;
		};
		this.range.addEventListener('input', () => {
			let value = rangeToTextValueFn(this.range.value);
			this.text.value = this.formatValueForText(value);
			this.value = parseFloat(this.text.value);
			if (this.onchange) { this.onchange(); }
		});
		this.text.addEventListener('change', () => {
			let isNumeric = !isNaN(this.text.value) && !isNaN(parseFloat(this.text.value));
			if (!isNumeric) { return; }
			this.value = parseFloat(this.text.value);
			this.range.value = this.searchValueForRange(this.value);
			if (this.onchange) { this.onchange(); }
		});
	}
	storeState() {
		return { value: this.value, range: this.range.value, text: this.text.value };
	}
	loadState(state) {
		this.value = state.value;
		this.range.value = state.range;
		this.text.value = state.text;
	}
	storeToContainer(container) {
		let changed = container[this.name].value != this.value;
		container[this.name].value = this.value;
		return changed;
	}
	loadFromContainer(container) {
		let changed = this.value != container[this.name].value;
		this.value = container[this.name].value;
		this.text.value = this.formatValueForText(this.value);
		this.range.value = this.searchValueForRange(this.value);
		return changed;
	}
}

class ButtonsControl {
	constructor(parentElement, buttonLabel, onclick) {
		this.onchange = null;

		this.rootElement = addElement(parentElement, 'div', 'control-input-bag');
		let row = addElement(this.rootElement, 'div', 'control-input-bag-row');
		let buttonLabelNode = addLabel(row, 'control-input-button', '');
		let buttonNode = addInput(buttonLabelNode, 'control-input-button', 'button');
		buttonNode.value = buttonLabel;
		buttonNode.addEventListener('click', () => { onclick(); });
	}
	storeState() { return 0; }
	loadState(state) {}
	storeToContainer(container) { return false; }
	loadFromContainer(container) { return false; }
}

//---------------------------------------------------------
// UI element creation helpers
function pushValue(basePtr, containerEntry) {
	let e = containerEntry;
	if (e.type == Type_Float) {
		main.rpc('PushFloat', basePtr + e.offset, e.value);
	} else if (e.type == Type_Uint32) {
		main.rpc('PushUint32', basePtr + e.offset, e.value << e.shift, e.mask);
	}
}

function addControl(parentElement, label, modeMask, createControlFn) {
	let row = addElement(parentElement, 'div', 'control-row');
	controls.push({control: row, modeMask});
	let labelNode = addElement(row, 'div', 'control-label');
	labelNode.innerHTML = `${label}:`;

	let inputArea = addElement(row, 'div', 'control-input-area');
	inputArea.id = label+'-input-area';

	let ctrl0 = createControlFn(inputArea, 0);
	ctrl0.loadFromContainer(containers[0]);

	let link = addElement(inputArea, 'div', 'control-link');
	let linkLabel = addLabel(link, 'link-toggle', '');
	let linkCheckbox = addInput(linkLabel, 'link-toggle', 'checkbox');
	let linkText = addElement(linkLabel, 'span', 'link-text');
	links.push({linkCheckbox, label}); // Hackily push the link into the global link list

	let ctrl1 = createControlFn(inputArea, 1);
	ctrl1.loadFromContainer(containers[1]);

	let undoState = null;

	let myPushValue = (side, logMsg) => {
		pushValue(containerPtrs[side], containers[side][label]);
		console.log(logMsg, side, (side == 0 ? ctrl0 : ctrl1).storeState());
	};

	ctrl0.onchange = () => {
		let changed = ctrl0.storeToContainer(containers[0]);
		if (changed) { myPushValue(0, label); }
		if (linkCheckbox.checked) {
			ctrl1.loadState(ctrl0.storeState());
			undoState = ctrl1.storeState();
			let changed1 = ctrl1.storeToContainer(containers[1]);
			if (changed1) { myPushValue(1, label); }
		}
		storeTweaks();
	};
	ctrl1.onchange = () => {
		undoState = ctrl1.storeState();
		let changed = ctrl1.storeToContainer(containers[1]);
		if (changed) { myPushValue(1, label); }
		// Disable the link
		linkCheckbox.checked = false;
		ctrl1.rootElement.classList.remove('control-input-linked');
		storeTweaks();
	};

	// Set up the link checkbox functionality
	linkCheckbox.addEventListener('change', () => {
		if (linkCheckbox.checked) {
			ctrl1.rootElement.classList.add('control-input-linked');
			ctrl1.loadState(ctrl0.storeState());
		} else {
			ctrl1.rootElement.classList.remove('control-input-linked');
			if (undoState) { ctrl1.loadState(undoState); }
		}
		let changed1 = ctrl1.storeToContainer(containers[1]);
		if (changed1) { myPushValue(1, `${label} link`); }
		storeTweaks();
	});
}

function addCheckbox(parentElement, label, modeMask, flags, checkboxLabels) {
	addControl(parentElement, label, modeMask, (parent, side) => {
		return new CheckboxControl(parent, label, flags, checkboxLabels);
	});
}

function addRadioButtons(parentElement, label, modeMask, buttonLabels) {
	addControl(parentElement, label, modeMask, (parent, side) => {
		return new RadioButtonsControl(parent, label, side, buttonLabels);
	});
}

function addDropdown(parentElement, label, modeMask, buttonLabels) {
	addControl(parentElement, label, modeMask, (parent, side) => {
		return new DropdownControl(parent, label, side, buttonLabels);
	});
}

function addRangeWithTextField(parentElement, label, modeMask, min, max, step, rangeToTextValueFn) {
	addControl(parentElement, label, modeMask, (parent, side) => {
		return new RangeWithTextFieldControl(parent, label, min, max, step, rangeToTextValueFn);
	});
}

function addButton(parentElement, label, modeMask, buttonLabel, onclick) {
	let buttons = [];
	let linkBox = {};
	addControl(parentElement, label, modeMask, (parent, side) => {
		buttons[side] = new ButtonsControl(parent, buttonLabel, () => {
			onclick(side);
			if (side == 0 && linkBox.link.checked) { onclick(1); }
		});
		return buttons[side];
	});
	linkBox.link = links[links.length - 1].linkCheckbox;
}

//-----------------------------------------------------------------------------
// Control group helpers
function controlGroupGetLabels(groupNode, options) {
	let controlRows = groupNode.querySelectorAll('.control-row');
	let labelTexts = [];
	for (let i = 0; i < controlRows.length; i++) {
		if (options !== 'visible-only' || controlRows[i].style.display != 'none') {
			let controlLabel = controlRows[i].querySelector('.control-label');
			labelTexts.push(controlLabel.textContent.replace(/(:\s*$)/g, ''));
		}
	}
	return labelTexts;
}
function controlGroupUpdateLabel(groupNode) {
	let labelTexts = controlGroupGetLabels(groupNode, 'visible-only');
	let groupLabel = groupNode.querySelector('.control-group-label');
	groupLabel.innerHTML = labelTexts.join(', ');
}
function controlGroupGetVisibility(groupNode) {
	let groupLabel = groupNode.querySelector('.control-group-label');
	let isVisible = groupLabel.style.display == 'none';
	return isVisible;
}
function controlGroupSetVisibility(groupNode, makeVisible) {
	let groupLabel = groupNode.querySelector('.control-group-label');
	let groupToggle = groupNode.querySelector('.control-group-toggle');
	let groupLine = groupNode.querySelector('.control-group-line');
	let groupMain = groupNode.querySelector('.control-group-main');
	if (makeVisible) {
		groupLabel.style.display = 'none';
		groupToggle.innerHTML = '-';
		groupLine.style.display = 'flex';
		groupMain.style.display = 'block';
	} else {
		controlGroupUpdateLabel(groupNode);
		groupLabel.style.display = 'flex';
		groupToggle.innerHTML = '+';
		groupLine.style.display = 'none';
		groupMain.style.display = 'none';
	}
}
function controlGroupStoreAllVisibility() {
	let collapsedControlGroups = {};
	for (let i = 0; i < controlGroups.length; i++) {
		let groupNode = controlGroups[i].group;
		if (!controlGroupGetVisibility(groupNode)) {
			let labelTexts = controlGroupGetLabels(groupNode);
			collapsedControlGroups[labelTexts.join(', ')] = 1;
		}
	}
	window.localStorage.setItem('collapsedControlGroups', JSON.stringify(collapsedControlGroups));
}
function controlGroupLoadAllVisibility() {
	const collapsedJson = localStorage.getItem('collapsedControlGroups');
	if (!collapsedJson) { return; }
	let collapsedControlGroups = JSON.parse(collapsedJson);
	for (let i = 0; i < controlGroups.length; i++) {
		let groupNode = controlGroups[i].group;
		let labelTexts = controlGroupGetLabels(groupNode);
		let isCollapsed = collapsedControlGroups[labelTexts.join(', ')];
		controlGroupSetVisibility(groupNode, !isCollapsed);
	}
}
function addControlGroup(parentElement, modeMask) {
	let groupNode = addElement(parentElement, 'div', 'control-group');
	controlGroups.push({group: groupNode, modeMask});
	let groupLeft = addElement(groupNode, 'div', 'control-group-left');
	let groupToggle = addElement(groupLeft, 'div', 'control-group-toggle');
	groupToggle.innerHTML = '-';
	let groupLine = addElement(groupLeft, 'div', 'control-group-line');
	let groupRight = addElement(groupNode, 'div', 'control-group-right');
	let groupLabel = addElement(groupRight, 'div', 'control-group-label');
	groupLabel.style.display = 'none';
	let groupMain = addElement(groupRight, 'div', 'control-group-main');

	function toggleVisibility() {
		let isVisible = controlGroupGetVisibility(groupNode);
		controlGroupSetVisibility(groupNode, !isVisible);
		controlGroupStoreAllVisibility();
	}
	groupLabel.addEventListener('click', toggleVisibility);
	groupLeft.addEventListener('click', toggleVisibility);

	return groupMain;
}

//-----------------------------------------------------------------------------
// Serializer helper for interpreting the byte data coming from WASM
let UTF8Decoder = new TextDecoder();
class Serializer {
	constructor(arrayBuffer) {
		this.u8 = new Uint8Array(arrayBuffer);
		this.u32 = new Uint32Array(arrayBuffer);
		this.f32 = new Float32Array(arrayBuffer);
		this.head = 0;
	}

	readUint32() {
		let idx = (this.head + 3) >>> 2;
		this.head = (idx + 1) * 4;
		return this.u32[idx];
	}
	readFloat() {
		let idx = (this.head + 3) >>> 2;
		this.head = (idx + 1) * 4;
		return this.f32[idx];
	}
	readPtr() {
		// Assumes 32-bit wasm
		return this.readUint32();
	}
	readString() {
		let len = this.readUint32();
		let idx = this.head;
		this.head += len;
		return UTF8Decoder.decode(this.u8.subarray(this.head - len, this.head));
	}
	readRangeMapping() {
		let type = this.readUint32();
		let fn = null;
		switch (type) {
			case RangeMappingType_Direct: {
				fn = (x) => { return parseFloat(x); };
			} break;
			case RangeMappingType_Linear: {
				let bias = this.readFloat();
				let scale = this.readFloat();
				fn = (x) => { return bias + scale * x; };
			} break;
			case RangeMappingType_Power: {
				let bias = this.readFloat();
				let scale = this.readFloat();
				let exponent = this.readFloat();
				fn = (x) => { return bias + scale * x ** exponent; };
			} break;
			case RangeMappingType_Exponential: {
				let linearBias = this.readFloat();
				let significand = this.readFloat();
				let base = this.readFloat();
				let exponentialBias = this.readFloat();
				let exponentialScale = this.readFloat();
				fn = (x) => { return linearBias + significand * base ** (exponentialBias + exponentialScale * x); };
			} break;
			default:
				console.error(`Unknown type ${type}`);
				fn = (x) => { return x; };
		}
		return { type, fn };
	}
}

//-----------------------------------------------------------------------------
// Interpret the serialized TweakSystem from WASM
function ingestTweakResult(arrayBuffer) {
	let controlsElem = document.getElementById('controls');
	let sleeveElem = addElement(controlsElem, 'div', 'control-sleeve');

	// This deserialization code must be kept in sync with the serialization
	// code on the WASM-side
	let s = new Serializer(arrayBuffer);

	let size = s.readUint32();
	console.assert(size == arrayBuffer.byteLength);

	version = s.readUint32();
	containerPtrs = [s.readPtr(), s.readPtr()];
	containers = [{}, {}];
	loadTweaks();

	let currentGroup = sleeveElem;

	let itemCount = s.readUint32();
	for (let itemIdx = 0; itemIdx < itemCount; itemIdx++) {
		let itemType = s.readUint32();
		switch (itemType) {
			case Tweak_Group: {
				let modeMask = s.readUint32();
				currentGroup = addControlGroup(sleeveElem, modeMask);
			} break;
			case Tweak_Checkboxes: {
				let modeMask = s.readUint32();
				let label = s.readString();
				let offset = s.readUint32();
				let flagCount = s.readUint32();
				let flags = [];
				for (let i = 0; i < flagCount; i++) {
					flags.push(s.readUint32());
				}
				let checkboxLabelCount = s.readUint32();
				let checkboxLabels = [];
				for (let i = 0; i < checkboxLabelCount; i++) {
					checkboxLabels.push(s.readString());
				}
				let initialValue0 = s.readUint32();
				let initialValue1 = s.readUint32();

				// This is just to make values saved in local storage more robust to changing flag values
				let mask = 0;
				let minFlag = 0x80000000;
				for (let i = 0; i < flagCount; i++) {
					mask |= flags[i];
					minFlag = Math.min(minFlag, flags[i]);
				}
				let shift = 31 - Math.clz32(minFlag);
				for (let i = 0; i < flagCount; i++) { flags[i] = flags[i] >> shift; }
				initialValue0 = initialValue0 >> shift;
				initialValue1 = initialValue1 >> shift;

				let value0 = containers[0][label] ? containers[0][label].value : initialValue0;
				let value1 = containers[1][label] ? containers[1][label].value : initialValue1;
				containers[0][label] = { type: Type_Uint32, value: value0, offset, shift, mask };
				containers[1][label] = { type: Type_Uint32, value: value1, offset, shift, mask };
				pushValue(containerPtrs[0], containers[0][label]);
				pushValue(containerPtrs[1], containers[1][label]);

				addCheckbox(currentGroup, label, modeMask, flags, checkboxLabels);
			} break;
			case Tweak_RadioButtons: {
				let modeMask = s.readUint32();
				let label = s.readString();
				let offset = s.readUint32();
				let shift = s.readUint32();
				let mask = s.readUint32() << shift;
				let buttonLabelCount = s.readUint32();
				let buttonLabels = [[]];
				let labelRow = buttonLabels[0];
				for (let i = 0; i < buttonLabelCount; i++) {
					let buttonLabel = s.readString();
					if (buttonLabel == '\n') {
						buttonLabels.push([]);
						labelRow = buttonLabels[buttonLabels.length - 1];
					} else {
						labelRow.push(buttonLabel);
					}
				}
				let initialValue0 = s.readUint32();
				let initialValue1 = s.readUint32();

				let value0 = containers[0][label] ? containers[0][label].value : initialValue0;
				let value1 = containers[1][label] ? containers[1][label].value : initialValue1;
				containers[0][label] = { type: Type_Uint32, value: value0, offset, shift, mask };
				containers[1][label] = { type: Type_Uint32, value: value1, offset, shift, mask };
				pushValue(containerPtrs[0], containers[0][label]);
				pushValue(containerPtrs[1], containers[1][label]);

				addRadioButtons(currentGroup, label, modeMask, buttonLabels);
			} break;
			case Tweak_Dropdown: {
				let modeMask = s.readUint32();
				let label = s.readString();
				let offset = s.readUint32();
				let shift = s.readUint32();
				let mask = s.readUint32() << shift;
				let buttonLabelCount = s.readUint32();
				let buttonLabels = [];
				for (let i = 0; i < buttonLabelCount; i++) {
					buttonLabels.push(s.readString());
				}
				let initialValue0 = s.readUint32();
				let initialValue1 = s.readUint32();

				let value0 = containers[0][label] ? containers[0][label].value : initialValue0;
				let value1 = containers[1][label] ? containers[1][label].value : initialValue1;
				containers[0][label] = { type: Type_Uint32, value: value0, offset, shift, mask };
				containers[1][label] = { type: Type_Uint32, value: value1, offset, shift, mask };
				pushValue(containerPtrs[0], containers[0][label]);
				pushValue(containerPtrs[1], containers[1][label]);

				addDropdown(currentGroup, label, modeMask, buttonLabels);
			} break;
			case Tweak_RangeWithTextField: {
				let modeMask = s.readUint32();
				let label = s.readString();
				let offset = s.readUint32();
				let valueType = s.readUint32();
				let inMin = s.readUint32();
				let inMax = s.readUint32();
				let mapping = s.readRangeMapping();
				let step = mapping.type == RangeMappingType_Direct ? 1 : 0;
				let initialValue = [0.0, 0.0];
				for (let i = 0; i < 2; i++) {
					switch (valueType) {
						case Type_Float: initialValue[i] = s.readFloat(); break;
						case Type_Uint32: initialValue[i] = s.readUint32(); break;
						default: console.error("Unsupported valueType", valueType);
					}
				}
				if (valueType == Type_Uint32) {
					let oldMappingFn = mapping.fn;
					mapping.fn = (x) => { return Math.round(oldMappingFn(x)); };
				}

				let value0 = containers[0][label] ? containers[0][label].value : initialValue[0];
				let value1 = containers[1][label] ? containers[1][label].value : initialValue[1];
				containers[0][label] = { type: valueType, value: value0, offset, shift: 0, mask: 0xffffffff };
				containers[1][label] = { type: valueType, value: value1, offset, shift: 0, mask: 0xffffffff };
				pushValue(containerPtrs[0], containers[0][label]);
				pushValue(containerPtrs[1], containers[1][label]);

				addRangeWithTextField(currentGroup, label, modeMask, inMin, inMax, step, mapping.fn);
			} break;
			case Tweak_Button: {
				let modeMask = s.readUint32();
				let label = s.readString();
				let buttonLabel = s.readString();
				let onclickFnName = s.readString();
				let onclick = (side) => { main.rpc(onclickFnName, side); };

				addButton(currentGroup, label, modeMask, buttonLabel, onclick);
			} break;
			default:
				console.error(`Unknown type ${itemType}`);
		}
	}

	// Set the content element's height to be equal to its max height to
	// prevent the viewport from jumping around when groups are opened and closed
	sleeveElem.style.height = sleeveElem.clientHeight + 'px';
	//@TODO: Technically, we just want to set the height whichever mode takes the most space ...
	//setMode(Mode_Sim);

	// Restore the shown/hidden state of groups
	// Make sure to only load control group visibility after we've set the max height
	controlGroupLoadAllVisibility();
}

tweak = {
	toggleAllLinks,
	resetTweaks,
	ingestTweakResult,
};

})();
