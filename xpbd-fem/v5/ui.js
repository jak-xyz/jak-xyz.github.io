const Settings_ElementTypeBit = 0;
const Settings_ElementTypeMask = (1 << 4) - 1;
const Settings_ConstructBlockFromSettings = (1 << 4);
const Settings_ForceResetBlock = (1 << 5);
const Settings_EnergyBit = 6;
const Settings_EnergyMask = (1 << 4) - 1;
const Settings_SolveBit = 10;
const Settings_SolveMask = (1 << 2) - 1;
const Settings_ShapeBit = 12;
const Settings_ShapeMask = (1 << 4) - 1;
const Settings_ElementPatternBit = 16;
const Settings_ElementPatternMask = (1 << 1) - 1;
const Settings_ConstraintOrderBit = 17;
const Settings_ConstraintOrderMask = (1 << 2) - 1;
const Settings_RayleighTypeBit = 19;
const Settings_RayleighTypeMask = (1 << 2) - 1;
const Settings_Rotate90Degrees = (1 << 21);
const Settings_Centered = (1 << 22);
const Settings_LockLeft = (1 << 23);
const Settings_LockRight = (1 << 24);
const Settings_RotateLock = (1 << 25);
const Settings_QuadratureOrderBit = 26;
const Settings_QuadratureOrderMask = (1 << 2) - 1;
const Settings_CalcVisBit = 28;
const Settings_CalcVisMask = (1 << 1) - 1;

const Element_Null = 0;
const Element_T3 = 1;
const Element_T6 = 2;
const Element_Q4 = 3;
const Element_Q8 = 4;
const Element_Q9 = 5;
const Element_T4 = 6;
const Element_T10 = 7;
const Element_H8 = 8;
const Element_H20 = 9;
const Element_H27 = 10;

const Energy_Pixar = 0;
const Energy_PixarReduced = 1;
const Energy_PixarSel = 2;
const Energy_Mixed = 3;
const Energy_MixedSel = 4;
const Energy_YeohSkin = 5;
const Energy_YeohSkinSel = 6;
const Energy_YeohSkinFast = 7;
const Energy_ContinuousPixar = 8;
const Energy_ContinuousMixed = 9;
const Energy_ContinuousSkin = 10;
const Energy_CubeNeo = 11;
const Energy_CubeSkin = 12;

const Solve_Serial = 0;
const Solve_Simultaneous = 1;
const Solve_DeviatoricOnly = 2;
const Solve_VolumetricOnly = 3;

const Shape_Single = 0;
const Shape_Line = 1;
const Shape_BeamL = 2;
const Shape_BeamM = 3;
const Shape_BeamH = 4;
const Shape_BeamL1x2 = 5;
const Shape_BeamL2x1 = 6;
const Shape_BeamL4x1 = 7;
const Shape_BeamL8x1 = 8;
const Shape_BoxL = 9;
const Shape_BoxM = 10;
const Shape_BoxH = 11;
const Shape_Armadillo = 12;

const Pattern_Uniform = 0;
const Pattern_Mirrored = 1;

const Rayleigh_Paper = 0;
const Rayleigh_Limit = 1;
const Rayleigh_Post = 2;
const Rayleigh_PostAmortized = 3;

const CalcVis_Invariants = 0;
const CalcVis_NTN = 1;

function makeDefaultSettings(element) {
	return {
	timeScale: 1.0,
	stepsPerSecond: 3000.0,
	volumePasses: 0,
	gravity: 0.05,
	compliance: 1.0,
	damping: 0.005,
	pbdDamping: 0.03,
	drag: 0.002,
	poissonsRatio: 0.495,
	leftRightSeparation: 1.0,
	wonkiness: 0.0,
	flags: Settings_ConstructBlockFromSettings |
		(element << Settings_ElementTypeBit) |
		(Energy_MixedSel << Settings_EnergyBit) |
		(Solve_Simultaneous << Settings_SolveBit) |
		(Shape_BoxL << Settings_ShapeBit) |
		(Pattern_Uniform << Settings_ElementPatternBit) |
		(Rayleigh_PostAmortized << Settings_RayleighTypeBit) |
		(2 << Settings_QuadratureOrderBit) |
		Settings_LockLeft,
	};
}
var settings = [makeDefaultSettings(Element_Q4), makeDefaultSettings(Element_Null)];
const SettingsId = 'settings_v5';
for (let i = 0; i < 2; i++) {
	const settingsJson = localStorage.getItem(`${SettingsId}[${i}]`);
	if (settingsJson) {
		settings[i] = JSON.parse(settingsJson);
		settings[i].flags &= ~Settings_ForceResetBlock;
	}
}

function updateSettings(simIdx) {
	simIdx = simIdx ? 1 : 0;
	let pushSettings = settings[simIdx];
	rpc('UpdateSettings',
		simIdx ? 1 : 0,
		pushSettings.timeScale,
		pushSettings.stepsPerSecond,
		pushSettings.volumePasses,
		pushSettings.gravity,
		pushSettings.compliance,
		pushSettings.damping,
		pushSettings.pbdDamping,
		pushSettings.drag,
		pushSettings.poissonsRatio,
		pushSettings.wonkiness,
		pushSettings.leftRightSeparation,
		pushSettings.flags
	);
	window.localStorage.setItem(`${SettingsId}[${simIdx}]`, JSON.stringify(pushSettings));
}

function resetBlocks() {
	settings[0].flags |= Settings_ForceResetBlock;
	settings[1].flags |= Settings_ForceResetBlock;
	updateSettings(0);
	updateSettings(1);
	settings[0].flags &= ~Settings_ForceResetBlock;
	settings[1].flags &= ~Settings_ForceResetBlock;
}
function resetSettings() {
	settings[0] = makeDefaultSettings(Element_Q4);
	settings[1] = makeDefaultSettings(Element_Null);
	resetBlocks();
	location.reload();
	return false;
}

const Demo_Sim = 1 << 0;
const Demo_Step = 1 << 1;
const Demo_Explore = 1 << 2;
var controls = [];
function setDemoMode(demoMode) {
	if (demoMode == Demo_Sim) { document.getElementById('mode-sim').checked = true; }
	if (demoMode == Demo_Step) { document.getElementById('mode-step').checked = true; }
	if (demoMode == Demo_Explore) { document.getElementById('mode-exp').checked = true; }
	let showRightSide = demoMode == Demo_Sim;
	for (let i = 0; i < controls.length; i++) {
		controls[i].control.style.display = (controls[i].demoMode & demoMode) ? 'flex' : 'none';
		let inputArea = controls[i].control.querySelector('.control-input-area');
		for (let j = 1; j < inputArea.childNodes.length; j++) {
			inputArea.childNodes[j].style.visibility = showRightSide ? 'visible' : 'hidden';
		}
	}
	rpc('SetDemoMode', demoMode);
}

var links = [];
function toggleAllLinks() {
	let target = !links[3].linkCheckbox.checked;
	for (let i = 3; i < links.length; i++) {
		links[i].linkCheckbox.checked = target;
		links[i].linkCheckbox.dispatchEvent(new Event('change'));
	}
}

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

class CheckboxControl {
	constructor(parentElement, flags, labels) {
		console.assert(flags.length == labels.length);
		this.flags = flags;
		this.onchange = null;

		this.rootElement = addElement(parentElement, 'div', 'control-input-bag');
		let row = addElement(this.rootElement, 'div', 'control-input-bag-row');
		this.checkboxes = [];
		for (let i = 0; i < flags.length; i++) {
			let labelNode = addLabel(row, 'control-input-bag-contents', labels[i]);
			let checkbox = addInput(labelNode, '', 'checkbox');
			checkbox.addEventListener('change', () => {
				if (this.onchange) { this.onchange(checkbox.checked); }
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
	storeToSettings(settings) {
		let changed = false;
		for (let i = 0; i < this.checkboxes.length; i++) {
			if (this.checkboxes[i].checked != !!(settings.flags & this.flags[i])) { changed = true; }
			if (this.checkboxes[i].checked) {
				settings.flags |= this.flags[i];
			} else {
				settings.flags &= ~this.flags[i];
			}
		}
		return changed;
	}
	loadFromSettings(settings) {
		let changed = false;
		for (let i = 0; i < this.checkboxes.length; i++) {
			if (this.checkboxes[i].checked != !!(settings.flags & this.flags[i])) { changed = true; }
			this.checkboxes[i].checked = !!(settings.flags & this.flags[i]);
		}
		return changed;
	}
}

class RadioButtonsControl {
	constructor(parentElement, flagBit, flagMask, name, labels) {
		this.flagBit = flagBit;
		this.flagMask = flagMask;
		this.onchange = null;

		this.rootElement = addElement(parentElement, 'div', 'control-input-bag');
		this.buttons = [];
		labels.forEach(labelRow => {
			let row = addElement(this.rootElement, 'div', 'control-input-bag-row');
			labelRow.forEach(label => {
				let labelNode = addLabel(row, 'control-input-bag-contents', label);
				let button = addInput(labelNode, '', 'radio');
				button.name = name;
				button.value = this.buttons.length;
				button.addEventListener('change', () => {
					if (this.onchange) { this.onchange(button.value); }
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
	storeToSettings(settings) {
		let setting = (settings.flags >> this.flagBit) & this.flagMask;
		let changed = !this.buttons[setting].checked;
		for (let i = 0; i < this.buttons.length; i++) {
			if (this.buttons[i].checked) {
				settings.flags &= ~(this.flagMask << this.flagBit);
				settings.flags |= i << this.flagBit;
				break;
			}
		}
		return changed;
	}
	loadFromSettings(settings) {
		let setting = (settings.flags >> this.flagBit) & this.flagMask;
		let changed = !this.buttons[setting].checked;
		this.buttons[setting].checked = true;
		return changed;
	}
}

class DropdownControl {
	constructor(parentElement, flagBit, flagMask, name, options) {
		this.flagBit = flagBit;
		this.flagMask = flagMask;
		this.onchange = null;

		this.rootElement = addElement(parentElement, 'div', 'control-input-dropdown');
		let labelNode = addLabel(this.rootElement, 'control-input-dropdown', '');
		this.selectNode = addElement(labelNode, 'select', 'control-select');
		this.selectNode.name = name;
		let yOffset = 0;
		let keepOnScreen = () => {
			if (this.selectNode.size > 1) {
				let brect = this.selectNode.getBoundingClientRect();
				yOffset = Math.min(0, yOffset + window.innerHeight - brect.bottom);
				this.selectNode.style.top = yOffset+'px';
			}
		};
		let delayTimer = null;
		this.selectNode.onmouseover = function() {
			if (!delayTimer) {
				let self = this;
				delayTimer = window.setTimeout(()=>{
					self.size = options.length;
					keepOnScreen();
					delayTimer = null;
				}, 33);
			}
		}
		window.addEventListener("scroll", keepOnScreen);
		this.selectNode.onmouseleave = function() {
			if (delayTimer) {
				window.clearTimeout(delayTimer);
				delayTimer = null;
			}
			this.size = 1;
			yOffset = 0;
			this.style.top = yOffset+'px';
		}
		for (let i = 0; i < options.length; i++) {
			let option = options[i];
			let optionNode = addElement(this.selectNode, 'option', 'control-option');
			optionNode.value = ''+i;
			optionNode.innerHTML = option;
		}
		this.selectNode.addEventListener('change', () => {
			if (this.onchange) { this.onchange(this.selectNode.value); }
		});
		// This allows the select node to appear centered in the control row while
		// still expanding downward, as expected
		let rect = this.selectNode.getBoundingClientRect();
		labelNode.style.height = rect.height+'px';
	}
	storeState() {
		return this.selectNode.value;
	}
	loadState(state) {
		this.selectNode.value = state;
	}
	storeToSettings(settings) {
		let setting = (settings.flags >> this.flagBit) & this.flagMask;
		let changed = this.selectNode.value != setting;
		settings.flags &= ~(this.flagMask << this.flagBit);
		settings.flags |= this.selectNode.value << this.flagBit;
		return changed;
	}
	loadFromSettings(settings) {
		let setting = (settings.flags >> this.flagBit) & this.flagMask;
		let changed = this.selectNode.value != setting;
		this.selectNode.value = setting;
		return changed;
	}
}

class RangeWithTextFieldControl {
	constructor(parentElement, setting, min, max, step, rangeToTextValueFn) {
		this.setting = setting;
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
			let str = ''+parseFloat(value);
			if (str.match('e')) { str = parseFloat(value).toFixed(20); } // No scientific notation allowed!
			let strBuilder = [];
			let firstSigIdx = 100000;
			let decimalIdx = 100000;
			for (let i = 0; i < str.length; i++) {
				if (i < firstSigIdx && str[i] >= '1' && str[i] <= '9') { firstSigIdx = i; }
				if (i < decimalIdx && str[i] == '.') { decimalIdx = i; ++firstSigIdx; }
				if (i >= decimalIdx && i > firstSigIdx + 2) { break; }
				strBuilder.push(i < firstSigIdx + 3 ? str[i] : '0');
			}
			while (strBuilder.length > decimalIdx && strBuilder[strBuilder.length - 1] == '0') { strBuilder.pop(); }
			if (strBuilder[strBuilder.length - 1] == '.') { strBuilder.pop(); }
			return strBuilder.join('');
		};
		this.searchValueForRange = (value) => {
			let low = min;
			let high = max;
			let guess = 0.5 * (low + high);
			for (let itr = 0; itr < 32; itr++) {
				if (value < rangeToTextValueFn(guess)) {
					high = guess;
				} else {
					low = guess;
				}
				guess = 0.5 * (low + high);
			}
			return guess;
		};
		this.range.addEventListener('input', () => {
			let value = rangeToTextValueFn(this.range.value);
			this.text.value = this.formatValueForText(value);
			this.value = parseFloat(this.text.value);
			if (this.onchange) { this.onchange(this.value); }
		});
		this.text.addEventListener('change', () => {
			let isNumeric = !isNaN(this.text.value) && !isNaN(parseFloat(this.text.value));
			if (!isNumeric) { return; }
			this.value = parseFloat(this.text.value);
			this.range.value = this.searchValueForRange(this.value);
			if (this.onchange) { this.onchange(this.value); }
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
	storeToSettings(settings) {
		let changed = settings[this.setting] != this.value;
		settings[this.setting] = this.value;
		return changed;
	}
	loadFromSettings(settings) {
		let changed = this.value != settings[this.setting];
		this.value = settings[this.setting];
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
	storeToSettings(settings) { return false; }
	loadFromSettings(settings) { return false; }
}

function addControl(parentElement, demoMode, label, createControlFn) {
	let row = addElement(parentElement, 'div', 'control-row');
	controls.push({control: row, demoMode});
	let labelNode = addElement(row, 'div', 'control-label');
	labelNode.innerHTML = label;

	let inputArea = addElement(row, 'div', 'control-input-area');
	inputArea.id = label+'-input-area';

	let ctrl0 = createControlFn(inputArea, 0);
	ctrl0.loadFromSettings(settings[0]);

	let link = addElement(inputArea, 'div', 'control-link');
	let linkLabel = addLabel(link, 'link-toggle', '');
	let linkCheckbox = addInput(linkLabel, 'link-toggle', 'checkbox');
	let linkText = addElement(linkLabel, 'span', 'link-text');
	links.push({linkCheckbox, label}); // Hackily push the link into the global link list

	let ctrl1 = createControlFn(inputArea, 1);
	ctrl1.loadFromSettings(settings[1]);

	let undoState = null;

	ctrl0.onchange = (value) => {
		let changed = ctrl0.storeToSettings(settings[0]);
		if (changed) { updateSettings(0); console.log(0, label, ctrl0.storeState()); }
		if (linkCheckbox.checked) {
			ctrl1.loadState(ctrl0.storeState());
			undoState = ctrl1.storeState();
			let changed1 = ctrl1.storeToSettings(settings[1]);
			if (changed1) { updateSettings(1); console.log(1, label, ctrl1.storeState()); }
		}
	};
	ctrl1.onchange = (value) => {
		undoState = ctrl1.storeState();
		let changed = ctrl1.storeToSettings(settings[1]);
		if (changed) { updateSettings(1); console.log(1, label, ctrl1.storeState()); }
		// Disable the link
		linkCheckbox.checked = false;
		ctrl1.rootElement.classList.remove('control-input-linked');
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
		let changed1 = ctrl1.storeToSettings(settings[1]);
		if (changed1) { updateSettings(1); console.log(1, label, 'link', ctrl1.storeState()); }
	});
}

function addCheckbox(parentElement, demoMode, label, flags, checkboxLabels) {
	addControl(parentElement, demoMode, label, (parent, side) => {
		return new CheckboxControl(parent, flags, checkboxLabels);
	});
}

function addRadioButtons(parentElement, demoMode, label, flagBit, flagMask, buttonLabels) {
	addControl(parentElement, demoMode, label, (parent, side) => {
		return new RadioButtonsControl(parent, flagBit, flagMask, label+side, buttonLabels);
	});
}

function addDropdown(parentElement, demoMode, label, flagBit, flagMask, optionLabels) {
	addControl(parentElement, demoMode, label, (parent, side) => {
		return new DropdownControl(parent, flagBit, flagMask, label+side, optionLabels);
	});
}

function addRangeWithTextField(parentElement, demoMode, label, setting, min, max, step, rangeToTextValueFn) {
	addControl(parentElement, demoMode, label, (parent, side) => {
		return new RangeWithTextFieldControl(parent, setting, min, max, step, rangeToTextValueFn);
	});
}

function addButton(parentElement, demoMode, label, buttonLabel, onclick) {
	let buttons = [];
	let linkBox = {};
	addControl(parentElement, demoMode, label, (parent, side) => {
		buttons[side] = new ButtonsControl(parent, buttonLabel, () => {
			onclick(side);
			if (side == 0 && linkBox.link.checked) { onclick(1); }
		});
		return buttons[side];
	});
	linkBox.link = links[links.length - 1].linkCheckbox;
}

document.addEventListener('DOMContentLoaded', function(event) {
	document.addEventListener('keydown', function(event) {
		// We never want to look at input if the user is typing in a text box
		if (document.activeElement.tagName.toLowerCase() == 'input' &&
			document.activeElement.type.toLowerCase() == 'text') { return; }

		if (event.key.toUpperCase() == 'R') {
			resetBlocks();
			rpc('ResetExplorer');
		}
		if (event.key.toUpperCase() == 'L') {
			toggleAllLinks();
		}
		if (event.key.toUpperCase() == 'S') {
			rpc('StepExplorer', 0);
			//rpc('StepExplorer', 1);
		}

		// Furthermore, certain inputs we don't want to look at if the user has anything selected
		if (document.activeElement != document.body) { return; }
	}, true);
});
