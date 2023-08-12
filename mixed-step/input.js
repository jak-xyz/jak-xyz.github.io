//------------------------------------------------------------------------------
// Retains system input messages into an easy-to-use format.
//------------------------------------------------------------------------------
var input_file = {};

(function() {
	const TouchEvent_Move = 0;
	const TouchEvent_Start = 1;
	const TouchEvent_End = 2;
	const TouchEvent_Cancel = 3;

	const TouchDevice_Touch = 0;
	const TouchDevice_Mouse = 1;

	class v2 {
		constructor(x, y) { this.x = x; this.y = y; }
		copyFrom(from) { this.x = from.x; this.y = from.y; }
		copyInto(into) { into.x = this.x; into.y = this.y; }
		clone() { return new v2(this.x, this.y); }
		neg() { return new v2(-this.x, -this.y); }
		add(v) { return new v2(this.x + v.x, this.y + v.y); }
		sub(v) { return new v2(this.x - v.x, this.y - v.y); }
		scale(s) { return new v2(this.x * s, this.y * s); }
		dot(v) { return this.x * v.x + this.y * v.y; }
		length() { return Math.sqrt(this.dot(this)); }
		distance(v) { return this.sub(v).length(); }
		normalize() { return this.clone().scale(1.0 / this.length()); }
		mix(v, t) { return new v2(this.x * (1.0 - t) + v.x * t, this.y * (1.0 - t) + v.y * t); }
	}

	class Touch {
		static MaxHistory = 16;

		constructor() {
			this.id = 0;
			this.device = 0;
			this.pos = new v2(0.0, 0.0);
			this.posOld = new v2(0.0, 0.0);
			this.posStart = new v2(0.0, 0.0);
			this.maxDistFromStart = 0.0;
			this.startTime = 0.0;
			this.lastUpdateTime = 0.0;
			this.isNew = true;
			this.isDead = false;
			this.isCanceled = false;

			// For internal use:
			this.osId = 0;
			this.history = [];
			this.historyTime = [];
			for (let i = 0; i < Touch.MaxHistory; i++) {
				this.history[i] = new v2(0.0, 0.0);
				this.historyTime[i] = 0.0;
			}
			this.historyCount = 0;
		}

		copyFrom(t) {
			this.id = t.id;
			this.device = t.device;
			this.pos.copyFrom(t.pos);
			this.posOld.copyFrom(t.posOld);
			this.posStart.copyFrom(t.posStart);
			this.maxDistFromStart = t.maxDistFromStart;
			this.startTime = t.startTime;
			this.lastUpdateTime = t.lastUpdateTime;
			this.isNew = t.isNew;
			this.isDead = t.isDead;
			this.isCanceled = t.isCanceled;
			this.osId = t.osId;
			for (let i = 0; i < Touch.MaxHistory; i++) {
				this.history[i].copyFrom(t.history[i]);
				this.historyTime[i] = t.historyTime[i];
			}
			this.historyCount = this.historyCount;
		}
		copyInto(t) { t.copyFrom(this); }

		getPosAtTime(time) {
			// Case 1: Given time is after our history
			if (time >= this.historyTime[0]) {
				return this.history[0];
			}
			// Case 2: Given time is within our history
			for (let i = 1; i < this.historyCount; i++) {
				if (time < this.historyTime[i - 1] && time >= this.historyTime[i]) {
					let t = (time - this.historyTime[i]) / (this.historyTime[i - 1] - this.historyTime[i]);
					return this.history[i].mix(this.history[i - 1], t);
				}
			}
			// Case 3: Given time is before our history
			return this.history[this.historyCount - 1];
		}

		getRecentSpeed(lastXSeconds) {
			if (typeof lastXSeconds === 'undefined') { lastXSeconds = 0.033; }
			lastXSeconds = Math.max(lastXSeconds, 0.001);
			// The OS can take a little bit of time to report a dead touch, so we
			// ignore the last few milliseconds for those
			let start = this.historyTime[0] - (this.isDead ? 0.016 : 0.0);
			return (this.getPosAtTime(start) - this.getPosAtTime(start - lastXSeconds)) / lastXSeconds;
		}
	}
	const DefaultTouch = new Touch();

	class Mouse {
		static MaxButtons = 3;

		constructor() {
			this.pos = new v2(0.0, 0.0);
			this.posOld = new v2(0.0, 0.0);
			this.button = new Array(Mouse.MaxButtons);
			this.buttonOld = new Array(Mouse.MaxButtons);
			for (let i = 0; i < Mouse.MaxButtons; i++) {
				this.button[i] = false;
				this.buttonOld[i] = false;
			}
		}
	}

	class Input {
		static MaxTouches = 20;

		constructor() {
			this.touches = [];
			this.touchCount = 0;
			this.capturedTouches = [];
			this.capturedTouchCount = 0;
			this.touchIdCounter = 0;
			for (let i = 0; i < Input.MaxTouches; i++) {
				this.touches[i] = new Touch();
				this.capturedTouches[i] = new Touch();
			}

			this.mouse = new Mouse();

			// For internal use:
			this.mouseLiveTouches = [];
			for (let i = 0; i < Mouse.MaxButtons; i++) {
				this.mouseLiveTouches[i] = new Touch();
			}
		}

		getTouchById(id) {
			for (let i = 0; i < this.touchCount; i++) {
				if (this.touches[i].id == id) {
					return touches[i];
				}
			}
			return null;
		}

		captureTouch(t) {
			for (let i = 0; i < this.touchCount; i++) {
				if (this.touches[i] !== t) { continue; }

				// Move the touch from the regular touch list to the captured list
				this.capturedTouches[this.capturedTouchCount].copyFrom(t);
				++this.capturedTouchCount;
				--this.touchCount;
				for (; i < this.touchCount; i++) { this.touches[i].copyFrom(this.touches[i + 1]); }
				return;
			}
			console.log('Given touch not active');
		}

		onTouchEvent(type, device, timestamp, osId, x, y) {
			// See if we're already tracking this touch
			let t = null;
			for (let i = 0; i < this.touchCount + this.capturedTouchCount; i++) {
				let touches = i < this.touchCount ? this.touches : this.capturedTouches;
				let j = i < this.touchCount ? i : (i - this.touchCount);
				if (touches[j].device == device && touches[j].osId == osId && !touches[j].isDead) {
					t = touches[j];
					break;
				}
			}

			// Handle starting and stopping touches
			if (type == TouchEvent_Start && t === null) {
				t = this.touches[this.touchCount];
				++this.touchCount;

				t.copyFrom(DefaultTouch);
				++this.touchIdCounter;
				t.id = this.touchIdCounter;
				t.device = device;
				t.osId = osId;
				t.posOld.x = x;
				t.posOld.y = y;
				t.posStart.x = x;
				t.posStart.y = y;
				t.startTime = timestamp;
				t.isNew = true;
				t.isDead = false;
				t.historyCount = 0;

				if (t.device == TouchDevice_Mouse && t.osId < Mouse.MaxButtons) {
					let anyPressed = false;
					for (let i = 0; i < Mouse.MaxButtons; i++) { anyPressed = anyPressed || this.mouse.button[i]; }
					if (!anyPressed) { this.mouse.posOld.copyFrom(t.posOld); }
					this.mouse.button[t.osId] = true;
				}
			}
			if ((type == TouchEvent_End || type == TouchEvent_Cancel) && t !== null) {
				t.isDead = true;
				t.isCanceled = type == TouchEvent_Cancel;

				if (t.device == TouchDevice_Mouse && t.osId < Mouse.MaxButtons) {
					this.mouse.button[t.osId] = false;
				}
			}

			// Do general state update
			if (t !== null) {
				let maxDistFromStartOld = t.maxDistFromStart;
				t.pos.x = x;
				t.pos.y = y;
				t.maxDistFromStart = Math.max(t.pos.distance(t.posStart), t.maxDistFromStart);
				t.lastUpdateTime = timestamp;

				// Hack to eliminate the hitch when the touch first moves out of the dead zone
				let wasAtStart = maxDistFromStartOld < 0.001;
				let age = timestamp - t.startTime;
				if (wasAtStart && t.maxDistFromStart >= 0.001 && t.maxDistFromStart < 200.0 * age) {
					t.posOld.copyFrom(t.pos);
				}

				if (t.historyCount == 0 || timestamp - t.historyTime[0] > 0.004) {
					for (let i = Touch.MaxHistory - 1; i > 0; i--) {
						t.history[i].copyFrom(t.history[i - 1]);
						t.historyTime[i] = t.historyTime[i - 1];
					}
					if (t.historyCount < Touch.MaxHistory) { ++t.historyCount; }

					t.history[0].x = x;
					t.history[0].y = y;
					t.historyTime[0] = timestamp;
				}
			}
			if (device == TouchDevice_Mouse) {
				this.mouse.pos.x = x;
				this.mouse.pos.y = y;
			}

			// Emulate the mouse with touches, the number of fingers on the screen
			// corresponding with the currently pressed mouse button
			let liveTouches = this.mouseLiveTouches;
			let liveTouchCount = 0;
			let anyRealMouse = false;
			for (let i = 0; i < this.touchCount; i++) {
				let mt = this.touches[i];
				if (mt.device == TouchDevice_Mouse) { anyRealMouse = true; break; }
				if (mt.isDead) { continue; }
				if (liveTouchCount < Mouse.MaxButtons) { liveTouches[liveTouchCount++].copyFrom(mt); }
			}
			if (!anyRealMouse) {
				if (liveTouchCount > 0) {
					this.mouse.pos.x = 0.0;
					this.mouse.pos.y = 0.0;
					this.mouse.posOld.x = 0.0;
					this.mouse.posOld.y = 0.0;
					for (let i = 0; i < liveTouchCount; i++) {
						this.mouse.pos.x += liveTouches[i].pos.x;
						this.mouse.pos.y += liveTouches[i].pos.y;
						this.mouse.posOld.x += liveTouches[i].posOld.x;
						this.mouse.posOld.y += liveTouches[i].posOld.y;
					}
					this.mouse.pos.x /= liveTouchCount;
					this.mouse.pos.y /= liveTouchCount;
					this.mouse.posOld.x /= liveTouchCount;
					this.mouse.posOld.y /= liveTouchCount;
				}
				for (let i = 0; i < Mouse.MaxButtons; i++) { this.mouse.button[i] = (i + 1) == liveTouchCount; }
			}
		}

		onFocus() {
			this.touchCount = 0;
			for (let i = 0; i < this.capturedTouchCount; i++) {
				this.capturedTouches[i].isDead = true;
				this.capturedTouches[i].isCanceled = true;
			}
			this.capturedTouchCount = 0;
			for (let i = 0; i < Mouse.MaxButtons; i++) { this.mouse.button[i] = false; }
		}

		flush() {
			// Update the isNew flags and clear out dead touches
			for (let touchType = 0; touchType < 2; touchType++) {
				let touches = touchType == 0 ? this.touches : this.capturedTouches;
				let count = touchType == 0 ? this.touchCount : this.capturedTouchCount;
				for (let i = count - 1; i >= 0; i--) {
					touches[i].posOld.copyFrom(touches[i].pos);
					touches[i].isNew = false;
					if (touches[i].isDead) {
						--count;
						for (let j = i; j < count; j++) { touches[j].copyFrom(touches[j + 1]); }
					}
				}
				if (touchType == 0) { this.touchCount = count; } else { this.capturedTouchCount = count; }
			}
			// Update mouse params
			this.mouse.posOld.copyFrom(this.mouse.pos);
			for (let i = 0; i < Mouse.MaxButtons; i++) { this.mouse.buttonOld[i] = this.mouse.button[i]; }
		}
	};

	input_file = {
		Input,
	};
})();
