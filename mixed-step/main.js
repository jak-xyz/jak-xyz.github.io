var gfx;
var ctx;
var input = new input_file.Input();
var mode = 0;
var modeOld = -1;

var settings = {
	constraint: 'distance',
	compliance: 0.0,
	alignment: 'horizontal',
	renderSubInterval: false,
};

class vec2 {
	constructor(x, y) { this.x = x; this.y = y; }
	set(v) { this.x = v.x; this.y = v.y; return this; }
	clone() { return new vec2(this.x, this.y); }
	neg() { this.x = -this.x; this.y = -this.y; return this; }
	add(v) { this.x += v.x; this.y += v.y; return this; }
	sub(v) { this.x -= v.x; this.y -= v.y; return this; }
	scale(f) { this.x *= f; this.y *= f; return this; }
	dot(v) { return this.x * v.x + this.y * v.y; }
	cross(v) { return this.x * v.y - this.y * v.x; }
	length() { return Math.sqrt(this.dot(this)); }
	normalize() { return this.scale(1.0 / Math.max(0.00000001, this.length())); }
}
class mat2 {
	constructor(c0, c1) { this.c = [c0.clone(), c1.clone()]; }
	set(m) { this.c[0].set(m.c[0]); this.c[1].set(m.c[1]); return this; }
	clone() { return new mat2(this.c[0], this.c[1]); }
	add(m) { this.c[0].add(m.c[0]); this.c[1].add(m.c[1]); return this; }
	scale(f) { this.c[0].scale(f); this.c[1].scale(f); return this; }
	matMul(m) {
		let t = this.clone().transpose();
		this.c[0].x = t.c[0].dot(m.c[0]);
		this.c[0].y = t.c[1].dot(m.c[0]);
		this.c[1].x = t.c[0].dot(m.c[1]);
		this.c[1].y = t.c[1].dot(m.c[1]);
		return this;
	}
	vecMul(v) { let t = this.clone().transpose(); return new vec2(t.c[0].dot(v), t.c[1].dot(v)); }
	determinant() { return this.c[0].x * this.c[1].y - this.c[0].y * this.c[1].x; }
	transpose() { [this.c[0].y, this.c[1].x] = [this.c[1].x, this.c[0].y]; return this; }
	adjugate() {
		[this.c[0].x, this.c[0].y, this.c[1].x, this.c[1].y] = [this.c[1].y, -this.c[0].y, -this.c[1].x, this.c[0].x];
		return this;
	}
	inverse() { this.adjugate().scale(1.0 / this.determinant()); return this; }

	static zero() { return new mat2(new vec2(0.0, 0.0), new vec2(0.0, 0.0)); }
	static outerProduct(c, r) { return new mat2(c.clone().scale(r.x), c.clone().scale(r.y)); }
}

class Gfx {
	constructor(parentElement) {
		this.canvas = document.createElement('canvas');
		this.canvas.style = 'width: 802px; height: 802px; image-rendering: -moz-crisp-edges; image-rendering: pixelated; border: solid 1px lightgray;'
		parentElement.appendChild(this.canvas);
		ctx = this.canvas.getContext('2d');
		this.viewportWidth = 100.0;
		this.viewportHeight = 100.0;
		this.ppi = 96.0;
	}

	resize() {
		let canvas = this.canvas;
		let w = canvas.clientWidth;
		let h = w;//canvas.parentElement.clientHeight;
		this.viewportWidth = 800;//Math.floor(w * window.devicePixelRatio);
		this.viewportHeight = 800;//Math.floor(h * window.devicePixelRatio);
		this.ppi = 96.0 * window.devicePixelRatio * (w / this.viewportWidth);
		canvas.width = this.viewportWidth;
		canvas.height = this.viewportHeight;
	}
}

class Manipulator {
	constructor() {
		this.pos = new vec2(0.0, 0.0);
		this.posOld = new vec2(0.0, 0.0);
		this.down = false;
		this.downOld = false;
		this.manipIdx = -1;
	}
}

class Sim {
	constructor(stepPerSecond, constraintInterval, forceSlowNodesFastConstraints) {
		this.stepPerSecond = stepPerSecond;
		this.constraintInterval = constraintInterval;
		this.forceSlowNodesFastConstraints = forceSlowNodesFastConstraints;
		this.X = [];
		this.X0 = [];
		this.O = [];
		this.V = [];
		this.w = [];
		this.locked = [];
		this.interval = [];
		this.distanceConstraints = [];
		this.shapeConstraints = [];

		// Position nodes and create new constraints
		if (settings.constraint === 'distance') {
			for (let i = 0; i < 15; i++) {
				this.X[i] = new vec2(0.0 + i, 0.0);
				this.X0[i] = this.X[i].clone();
				this.O[i] = this.X[i].clone();
				this.V[i] = new vec2(0.0, 0.0);
				this.w[i] = 1.0;
				this.locked[i] = i == 0;
				this.interval[i] = (i < 5 || i >= 10) ? constraintInterval : 1;
				if (this.forceSlowNodesFastConstraints) {
					this.interval[i] = constraintInterval;
				}
			}
			for (let i = 0; i < this.X.length - 1; i++) {
				this.distanceConstraints.push({ i, j: i + 1, len0: 1.0, di: new vec2(0.0, 0.0), dj: new vec2(0.0, 0.0) });
			}
		} else {
			let w = 16;
			let h = 7;
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					let i = x + y * w;
					if (settings.alignment === 'horizontal') {
						this.X[i] = new vec2(2.0 * (y - 0.5 * h), -2.0 * x, );
					} else {
						this.X[i] = new vec2(2.0 * (x - 0.5 * w), 2.0 * (y - h));
					}
					this.X0[i] = this.X[i].clone();
					this.O[i] = this.X[i].clone();
					this.V[i] = new vec2(0.0, 0.0);
					this.w[i] = 1.0;
					this.locked[i] = x == 0;
					this.interval[i] = x > 1 && y > 1 && x < w - 2 && y < h - 2 ? 1 : constraintInterval;
					if (this.forceSlowNodesFastConstraints) {
						this.interval[i] = constraintInterval;
					}
				}
			}
			for (let y = 0; y < h - 1; y++) {
				for (let x = 0; x < w - 1; x++) {
					let is = [(x) + (y) * w, (x + 1) + (y) * w, (x + 1) + (y + 1) * w, (x) + (y + 1) * w];
					let a = this.X[is[0]].clone().sub(this.X[is[2]]);
					let b = this.X[is[1]].clone().sub(this.X[is[3]]);
					let vol0 = a.cross(b);
					this.shapeConstraints.push({ is, vol0 });
				}
			}
		}

		// Randomize the order of the constraints so we don't resolve long sequences of neighbors in a row
		for (let i = this.distanceConstraints.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this.distanceConstraints[i], this.distanceConstraints[j]] = [this.distanceConstraints[j], this.distanceConstraints[i]];
		}
		for (let i = this.shapeConstraints.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this.shapeConstraints[i], this.shapeConstraints[j]] = [this.shapeConstraints[j], this.shapeConstraints[i]];
		}

		// Sort higher interval ("slow") nodes and constraints so they appear first in their arrays
		this.slowNodeLength = this.X.length;
		this.slowDistanceLength = 0;
		this.slowShapeLength = 0;
		{
			// Sort nodes
			let combo = [];
			for (let i = 0; i < this.X.length; i++) {
				combo.push({ i, X: this.X[i], X0: this.X0[i], O: this.O[i], V: this.V[i], w: this.w[i], locked: this.locked[i], interval: this.interval[i] });
			}
			combo.sort((a, b) => a.interval > b.interval ? -1 : a.interval == b.interval ? 0 : 1);
			for (let i = 0; i < this.X.length; i++) {
				this.X[i] = combo[i].X;
				this.X0[i] = combo[i].X0;
				this.O[i] = combo[i].O;
				this.V[i] = combo[i].V;
				this.w[i] = combo[i].w;
				this.locked[i] = combo[i].locked;
				this.interval[i] = combo[i].interval;
				if (i > 0 && this.interval[i - 1] == constraintInterval && this.interval[i] != constraintInterval) {
					this.slowNodeLength = i;
				}
			}

			// Update constraints with the new node idxs
			let map = Array(combo.length);
			for (let i = 0; i < combo.length; i++) {
				map[combo[i].i] = i;
			}
			for (let c of this.distanceConstraints) {
				c.i = map[c.i];
				c.j = map[c.j];
			}
			for (let c of this.shapeConstraints) {
				for (let j = 0; j < 4; j++) {
					c.is[j] = map[c.is[j]];
				}
			}

			// Sort the constraints so the slow ones come first
			if (!this.forceSlowNodesFastConstraints) {
				let distanceConstraintInterval = (c) => {
					return Math.min(this.interval[c.i], this.interval[c.j]);
				};
				this.distanceConstraints.sort((a, b) => {
					let aInterval = distanceConstraintInterval(a);
					let bInterval = distanceConstraintInterval(b);
					return aInterval > bInterval ? -1 : aInterval == bInterval ? 0 : 1;
				});
				for (let i = 1; i < this.distanceConstraints.length; i++) {
					if (distanceConstraintInterval(this.distanceConstraints[i - 1]) > distanceConstraintInterval(this.distanceConstraints[i])) {
						this.slowDistanceLength = i;
					}
				}
				let shapeConstraintInterval = (c) => {
					return Math.min(this.interval[c.is[0]], this.interval[c.is[1]], this.interval[c.is[2]], this.interval[c.is[3]]);
				};
				this.shapeConstraints.sort((a, b) => {
					let aInterval = shapeConstraintInterval(a);
					let bInterval = shapeConstraintInterval(b);
					return aInterval > bInterval ? -1 : aInterval == bInterval ? 0 : 1;
				});
				for (let i = 1; i < this.shapeConstraints.length; i++) {
					if (shapeConstraintInterval(this.shapeConstraints[i - 1]) > shapeConstraintInterval(this.shapeConstraints[i])) {
						this.slowShapeLength = i;
					}
				}
			}
		}

		this.offset = new vec2(0.0, 0.0);
		this.scale = 1.0;

		this.manip = new Manipulator();

		this.accum = 0.0;
		this.tickId = 0;
	}

	update(dt, offset) {
		const { X, X0, O, V, w, locked, interval, manip } = this;
		this.accum += dt;
		let sdt = 1.0 / this.stepPerSecond;

		// Manipulator logic
		manip.posOld.set(manip.pos);
		manip.pos.x = (input.mouse.pos.x - this.offset.x) / this.scale;
		manip.pos.y = -(input.mouse.pos.y - this.offset.y) / this.scale;
		manip.downOld = manip.down;
		manip.down = input.mouse.button[0];
		if (manip.down && !manip.downOld) {
			let minDistance = 1.0e23;
			let nearestNodeIdx = -1;
			for (let i = 0; i < X.length; i++) {
				if (this.locked[i]) { continue; }
				let distance = X[i].clone().sub(manip.pos).length();
				if (minDistance > distance) {
					minDistance = distance;
					nearestNodeIdx = i;
				}
			}
			if (minDistance < 2.5) {
				manip.manipIdx = nearestNodeIdx;
				manip.posOld.set(manip.pos);
			}
		} else if (!manip.down) {
			manip.manipIdx = -1;
		}

		// Substep loop
		let substepCount = Math.floor(this.accum / sdt);
		if (!settings.renderSubInterval) {
			substepCount = this.constraintInterval * Math.floor((substepCount + this.tickId) / this.constraintInterval) - this.tickId;
		}
		this.accum -= sdt * substepCount;
		for (let substep = 0; substep < substepCount; substep++) {
			// First do a pass over the "slow" nodes/constraints, then do the rest
			for (let pass = 0; pass < 2; pass++) {
				// We can skip most substeps for the slow pass
				if (pass == 0 && this.tickId % this.constraintInterval != 0) { continue; }

				let nodeBegin = pass == 0 ? 0 : this.slowNodeLength;
				let nodeEnd = pass == 0 ? this.slowNodeLength : X.length;
				let distBegin = pass == 0 ? 0 : this.slowDistanceLength;
				let distEnd = pass == 0 ? this.slowDistanceLength : this.distanceConstraints.length;
				let shapeBegin = pass == 0 ? 0 : this.slowShapeLength;
				let shapeEnd = pass == 0 ? this.slowShapeLength : this.shapeConstraints.length;

				// Predict
				for (let i = nodeBegin; i < nodeEnd; i++) {
					if (locked[i]) {
						X[i].set(O[i]);
						V[i].x = 0.0;
						V[i].y = 0.0;
						w[i] = 0.001;
					} else {
						O[i].set(X[i]);
						V[i].y += sdt * interval[i] * -50.0; // Gravity
						X[i].add(V[i].clone().scale(sdt * interval[i]));
					}
				}

				// Manipulation constraint
				if (manip.manipIdx >= nodeBegin && manip.manipIdx < nodeEnd) {
					let t = (1 + substep) / substepCount;
					let i = manip.manipIdx;
					let target = manip.posOld.clone().scale(1.0 - t).add(manip.pos.clone().scale(t));
					let alpha = 0.0005;
					X[i].add(target.sub(X[i]).scale(w[i] / (w[i] + alpha / (sdt * interval[i] * sdt * interval[i]))));
				}

				// Distance constraints
				for (let cIdx = distBegin; cIdx < distEnd; cIdx++) {
					let { i, j, len0 } = this.distanceConstraints[cIdx];

					if (interval[i] == interval[j] && !this.forceSlowNodesFastConstraints) {
						// Regular XPBD distance constraint
						let to = X[i].clone().sub(X[j]);
						let N = to.clone().normalize();
						let C = to.length() - len0;
						let alpha = settings.compliance / (sdt * interval[i] * sdt * interval[i]);
						let lambda = -C / (w[i] + w[j] + alpha);

						X[i].add(N.clone().scale(w[i] * lambda));
						X[j].sub(N.clone().scale(w[j] * lambda));
					} else {
						// Modified distance constraint to handle mixed time steps
						let period = Math.max(interval[i], interval[j]);
						let phase = this.tickId % period;

						// Calc modified inverse masses so that tilda compliance is compatible between time steps
						let wi = w[i] * interval[i] * interval[i];
						let wj = w[j] * interval[j] * interval[j];

						// Otherwise regular XPBD ...
						let to = X[i].clone().sub(X[j]);
						let N = to.clone().normalize();
						let C = to.length() - len0;
						let alpha = settings.compliance / (sdt * sdt);
						let lambda = -C / (wi + wj + alpha);

						// ... except we scale lambda to reduce vibrations by compensating for shrinkage in
						// abs(C) over the interval
						let slow_gwg = (interval[i] == period ? wi : 0.0) + (interval[j] == period ? wj : 0.0);
						let scale = 1.0 / (1.0 - (phase / period) * (slow_gwg / (wi + wj + alpha)));
						lambda *= scale;

						X[i].add(N.clone().scale(wi / interval[i] * lambda));
						X[j].sub(N.clone().scale(wj / interval[j] * lambda));
					}
				}

				// Physically based shape matching constraints
				for (let cIdx = shapeBegin; cIdx < shapeEnd; cIdx++) {
					let { is, vol0 } = this.shapeConstraints[cIdx];

					// Most of this code is the same for regular and mixed time step versions. The differences
					// to support mixed time steps will branch on allSameInterval.
					let allSameInterval = interval[is[0]] == interval[is[1]] && interval[is[0]] == interval[is[2]] && interval[is[0]] == interval[is[3]];
					if (this.forceSlowNodesFastConstraints) { allSameInterval = false; }
					let period = Math.max(interval[is[0]], interval[is[1]], interval[is[2]], interval[is[3]]);
					let phase = this.tickId % period;

					// if (this.shapeOrder[cIdx] == 100 && this.tickId % 20 == 0) {
					// 	console.log(period);
					// }

					// Find the centers of mass in the current (P) and rest (Q) configurations
					let PCM = new vec2(0.0, 0.0);
					let QCM = new vec2(0.0, 0.0);
					let weightSum = 0.0;
					for (let j = 0; j < 4; j++) {
						let m = 1.0 / w[is[j]];
						PCM.add(X[is[j]].clone().scale(m));
						QCM.add(X0[is[j]].clone().scale(m));
						weightSum += m;
					}
					PCM.scale(1.0 / weightSum);
					QCM.scale(1.0 / weightSum);

					// Use least squares shape matching to calculate the deformation gradient (F)
					// at the center of mass
					let P = [];
					let Q = [];
					let PQ = mat2.zero();
					let QQ = mat2.zero();
					for (let j = 0; j < 4; j++) {
						P[j] = X[is[j]].clone().sub(PCM);
						Q[j] = X0[is[j]].clone().sub(QCM);
						PQ.add(mat2.outerProduct(P[j], Q[j]));
						QQ.add(mat2.outerProduct(Q[j], Q[j]));
					}
					let QQi = QQ.clone().inverse();
					let F = PQ.clone().matMul(QQi);

					// Calculate deviatoric and volumetric energies (and their gradients with respect to PQ)
					// (Our constitutive model is incompressible Neo-Hookean)
					let tr = F.c[0].dot(F.c[0]) + F.c[1].dot(F.c[1]);
					let U0 = tr;
					let G0 = F.clone().scale(2.0).matMul(QQi);

					let det = F.determinant();
					let adjF = F.clone().adjugate();
					let U1 = (det - 1.0) * (det - 1.0);
					let G1 = adjF.clone().scale(2.0 * (det - 1.0)).transpose().matMul(QQi);

					// Calculate the time step-modified inverse masses, since we're going to need them soon
					let ws = [];
					for (let j = 0; j < 4; j++) {
						ws[j] = w[is[j]] * interval[is[j]] * interval[is[j]];
					}

					// Run the 2x2 matrix form of energy XPBD to solve for deviatoric and volumetric lambdas
					let g0 = [];
					let g1 = [];
					let gwg00 = 1.0e-22;
					let gwg10 = 0.0;
					let gwg11 = 1.0e-22;
					for (let j = 0; j < 4; j++) {
						g0[j] = G0.vecMul(Q[j]);
						g1[j] = G1.vecMul(Q[j]);
						gwg00 += g0[j].dot(g0[j]) * ws[j];
						gwg10 += g1[j].dot(g0[j]) * ws[j];
						gwg11 += g1[j].dot(g1[j]) * ws[j];
					}
					let alphaD = settings.compliance / vol0 / (sdt * sdt);
					let alphaV = 0.0 / vol0 / (sdt * sdt);
					let A00 = gwg00 + 2.0 * U0 * alphaD;
					let A10 = gwg10;
					let A11 = gwg11 + 2.0 * U1 * alphaV;
					let b0 = -2.0 * U0;
					let b1 = -2.0 * U1;

					if (!allSameInterval) {
						// Scale lambda to reduce vibrations by compensating for shrinkage in abs(U) over the period
						let slow_gwg00 = 0.0;
						let slow_gwg11 = 0.0;
						for (let j = 0; j < 4; j++) {
							if (interval[is[j]] == period) {
								slow_gwg00 += g0[j].dot(g0[j]) * ws[j];
								slow_gwg11 += g1[j].dot(g1[j]) * ws[j];
							}
						}
						let scale0 = 1.0 / (1.0 - (phase / period) * (slow_gwg00 / A00));
						let scale1 = 1.0 / (1.0 - (phase / period) * (slow_gwg11 / A11));
						b0 *= scale0;
						b1 *= scale1;
					}

					// Cramer's rule (massaged to prevent floating point over/underflow)
					let invA00 = 1.0 / A00;
					let invA11 = 1.0 / A11;
					let invDet = 1.0 / Math.max(0.00000001, 1.0 - (A10 * invA00) * (A10 * invA11));
					let lambda0 = invDet * ((b0 * invA00) - (A10 * invA00) * (b1 * invA11));
					let lambda1 = invDet * ((b1 * invA11) - (b0 * invA00) * (A10 * invA11));

					// Apply displacements
					for (let j = 0; j < 4; j++) {
						let mixedStepCompensation = allSameInterval ? 1.0 : (1.0 / interval[is[j]]);
						X[is[j]].add(g0[j].clone().scale(mixedStepCompensation * ws[j] * lambda0));
						X[is[j]].add(g1[j].clone().scale(mixedStepCompensation * ws[j] * lambda1));
					}

					// Filter out zero-energy modes
					{
						// Calculate the new F at the center of mass
						let P = [];
						let PQ = mat2.zero();
						for (let j = 0; j < 4; j++) {
							P[j] = X[is[j]].clone().sub(PCM);
							PQ.add(mat2.outerProduct(P[j], Q[j]));
						}
						let F = PQ.clone().matMul(QQi);

						if (allSameInterval) {
							// With regular zero-energy mode regularization, the mass terms in the constraint
							// and the mass terms in XPBD cancel out nicely so we can just lerp to the affine-
							// transformed positions.
							let alpha = (1.0 * settings.compliance) / vol0 / (sdt * period * sdt * period);
							let t = 1.0 / (1.0 + alpha);
							for (let j = 0; j < 4; j++) {
								let toAffine = F.vecMul(Q[j]).sub(P[j]);
								X[is[j]].add(toAffine.scale(t));
							}
						} else {
							// But with the modified inverse masses necessary for mixed time steps, we have
							// to run nearly full energy XPBD.
							let U = 1.0e-22;
							let UMod = 1.0e-22;
							let g = [];
							let slow_gwg = 0.0;
							for (let j = 0; j < 4; j++) {
								let dX = P[j].clone().sub(F.vecMul(Q[j]));
								U += (1.0 / 2.0) * dX.dot(dX) * (1.0 / w[is[j]]);
								UMod += (1.0 / 2.0) * dX.dot(dX) * (1.0 / w[is[j]]) * interval[is[j]] * interval[is[j]];
								g[j] = dX.clone().scale(1.0 / w[is[j]]);
								if (interval[is[j]] == period) {
									slow_gwg += dX.dot(dX) * (1.0 / w[is[j]]) * interval[is[j]] * interval[is[j]];
								}
							}
							let alpha = (1.0 * settings.compliance) / vol0 / (sdt * sdt);
							let lambda = -2.0 * U / (2.0 * UMod + 2.0 * U * alpha);
							// Anti-vibration scaling
							let scale = 1.0 / (1.0 - (phase / period) * (slow_gwg / (2.0 * UMod + 2.0 * U * alpha)));
							lambda *= scale;
							//
							for (let j = 0; j < 4; j++) {
								X[is[j]].add(g[j].clone().scale(ws[j] / interval[is[j]] * lambda));
							}
						}
					}
				}
			}

			// Update velocity (after resolving all slow and fast constraints)
			for (let pass = 0; pass < 2; pass++) {
				// We can skip most substeps for the slow pass
				if (pass == 0 && (this.tickId + 1) % this.constraintInterval != 0) { continue; }

				let nodeBegin = pass == 0 ? 0 : this.slowNodeLength;
				let nodeEnd = pass == 0 ? this.slowNodeLength : X.length;

				for (let i = nodeBegin; i < nodeEnd; i++) {
					V[i].set(X[i].clone().sub(O[i]).scale(1.0 / (sdt * interval[i])));
				}
			}

			++this.tickId;
		}
	}

	render(ctx) {
		const {X, X0, O, V, w, interval} = this;
		let sdt = 1.0 / this.stepPerSecond;

		ctx.save();
		ctx.translate(this.offset.x, this.offset.y);
		ctx.scale(this.scale, -this.scale);
		ctx.lineWidth = 1.0 / this.scale;

		const FAST_NODE = '#F93808';
		const SLOW_NODE = '#1B53A6';
		const FAST_CONSTRAINT = '#FA3823';
		const SLOW_CONSTRAINT = '#154183';
		const MIXED_CONSTRAINT = '#C85585';

		for (let cIdx = 0; cIdx < this.distanceConstraints.length; cIdx++) {
			let { i, j } = this.distanceConstraints[cIdx];
			let isFast = this.forceSlowNodesFastConstraints || (interval[i] == 1 && interval[j] == 1);
			let isSlow = !this.forceSlowNodesFastConstraints && (interval[i] > 1 && interval[j] > 1);
			ctx.strokeStyle = isFast ? FAST_CONSTRAINT : isSlow ? SLOW_CONSTRAINT : MIXED_CONSTRAINT;
			ctx.beginPath();
			ctx.moveTo(X[i].x, X[i].y);
			ctx.lineTo(X[j].x, X[j].y);
			ctx.stroke();
		}

		for (let cIdx = 0; cIdx < this.shapeConstraints.length; cIdx++) {
			let is = this.shapeConstraints[cIdx].is;
			let isFast = this.forceSlowNodesFastConstraints ||
				(interval[is[0]] == 1 && interval[is[1]] == 1 && interval[is[2]] == 1 && interval[is[3]] == 1);
			let isSlow = !this.forceSlowNodesFastConstraints &&
				(interval[is[0]] > 1 && interval[is[1]] > 1 && interval[is[2]] > 1 && interval[is[3]] > 1);
			ctx.strokeStyle = isFast ? FAST_CONSTRAINT : isSlow ? SLOW_CONSTRAINT : MIXED_CONSTRAINT;
			let C = X[is[0]].clone().add(X[is[1]]).add(X[is[2]]).add(X[is[3]]).scale(1.0 / 4.0);
			let Y = [];
			for (let j = 0; j < 4; j++) {
				Y[j] = C.clone().add(X[is[j]].clone().sub(C).scale(0.7));
			}
			ctx.beginPath();
			ctx.moveTo(Y[3].x, Y[3].y);
			for (let j = 0; j < 4; j++) {
				ctx.lineTo(Y[j].x, Y[j].y);
			}
			ctx.stroke();
		}

		for (let i = 0; i < X.length; i++) {
			let isFast = interval[i] == 1;
			ctx.fillStyle = isFast ? FAST_NODE : SLOW_NODE;
			ctx.beginPath();
			ctx.arc(X[i].x, X[i].y, 0.2, 0.0, 2.0 * Math.PI);
			ctx.fill();
		}

		ctx.restore();
	}
}

var sims = [];

//-----------------------------------------------------------------------------
// Update loop
let timestampOld = 0.0;
let firstFrame = true;
function update(timestamp) {
	let dt = Math.min((1.0 / 60.0), 0.001 * (timestamp - timestampOld));
	timestampOld = timestamp;

	if (firstFrame) {
		firstFrame = false;

		// Do init here!
	}

	if (mode != modeOld) {
		mode = parseInt(mode);
		if (!(mode >= 0 && mode <= 3)) { mode = 0; }
		modeOld = mode;
		switch (mode) {
			case 0:
				settings.constraint = 'distance';
				settings.compliance = 0.0;
				settings.alignment = 'horizontal';
			break;
			case 1:
				settings.constraint = 'distance';
				settings.compliance = 0.0005;
				settings.alignment = 'horizontal';
			break;
			case 2:
				settings.constraint = 'shape';
				settings.compliance = 0.001;
				settings.alignment = 'vertical';
			break;
			case 3:
				settings.constraint = 'shape';
				settings.compliance = 0.01;
				settings.alignment = 'horizontal';
			break;
		}

		sims = [new Sim(Math.floor(600.0), 1, false), new Sim(600.0, 4, false), new Sim(600.0, 4, true)];

		for (let i = 0; i < sims.length; i++) {
			let sim = sims[i];
			if (settings.alignment === 'horizontal') {
				sim.offset = new vec2(400.0 + 200.0 * (i + 0.5 * (1.0 - sims.length)), 50.0);
			} else {
				sim.offset = new vec2(400.0, 50.0 + 200.0 * i);
			}
			sim.scale = 10.0;
		}
	}

	for (sim of sims) {
		sim.update(dt);
	}

	ctx.clearRect(0, 0, gfx.canvas.width, gfx.canvas.height);
	for (let i = 0; i < sims.length; i++) {
		let sim = sims[i];
		sim.render(ctx);
	}

	input.flush();

	window.requestAnimationFrame(update);
}

//-----------------------------------------------------------------------------
// Initialization
document.addEventListener('DOMContentLoaded', function(event) {
	let content = document.getElementById('content');
	gfx = new Gfx(content);

	let resize = () => {
		gfx.resize();
	};
	resize();
	window.addEventListener('resize', resize, false);

	//-----------------------------
	// Pass along input to the native code
	const TouchEvent_Move = 0;
	const TouchEvent_Start = 1;
	const TouchEvent_End = 2;
	const TouchEvent_Cancel = 3;

	const TouchDevice_Touch = 0;
	const TouchDevice_Mouse = 1;

	let onTouchShared = (event, type) => {
		if (type != TouchEvent_Cancel) {
			event.preventDefault();
		}

		let time = 0.001 * (event.timeStamp || performance.now());
		let canvasRect = gfx.canvas.getBoundingClientRect();
		for (let i = 0; i < event.changedTouches.length; i++) {
			let t = event.changedTouches[i];
			let id = t.identifier + 5; // Allow room for virtual mouse IDs
			let x = (t.clientX - canvasRect.x) * (gfx.viewportWidth / gfx.canvas.clientWidth);   // Convert from device pixels
			let y = (t.clientY - canvasRect.y) * (gfx.viewportHeight / gfx.canvas.clientHeight); // to viewport pixels
			input.onTouchEvent(type, TouchDevice_Touch, time, id, x, y);
		}
	};
	let onTouchMove = (event) => { onTouchShared(event, TouchEvent_Move); };
	let onTouchStart = (event) => { onTouchShared(event, TouchEvent_Start); };
	let onTouchEnd = (event) => { onTouchShared(event, TouchEvent_End); };
	let onTouchCancel = (event) => { onTouchShared(event, TouchEvent_Cancel); };
	gfx.canvas.addEventListener("touchmove", onTouchMove, false);
	gfx.canvas.addEventListener("touchstart", onTouchStart, false);
	gfx.canvas.addEventListener("touchend", onTouchEnd, false);
	gfx.canvas.addEventListener("touchcancel", onTouchCancel, false);
	
	// Simulate touches with the mouse
	let onMouseShared = (event, type) => {
		let time = 0.001 * (event.timeStamp || performance.now());
		let canvasRect = gfx.canvas.getBoundingClientRect();
		let x = (event.clientX - canvasRect.x) * (gfx.viewportWidth / gfx.canvas.clientWidth);
		let y = (event.clientY - canvasRect.y) * (gfx.viewportHeight / gfx.canvas.clientHeight);

		if (type == TouchEvent_Move) {
			for (let i = 0; i < 5; i++) {
				if (event.buttons & (1 << i)) {
					input.onTouchEvent(type, TouchDevice_Mouse, time, i, x, y);
				}
			}
			input.onTouchEvent(type, TouchDevice_Mouse, time, 0xffffffff, x, y);
		} else {
			let map = [0, 2, 1, 3, 4];
			input.onTouchEvent(type, TouchDevice_Mouse, time, map[event.button], x, y);
		}

		return false;
	};
	let onMouseMove = (event) => { onMouseShared(event, TouchEvent_Move); };
	let onMouseDown = (event) => {
		onMouseShared(event, TouchEvent_Start);
		window.getSelection().removeAllRanges();
	};
	let onMouseUp = (event) => { onMouseShared(event, TouchEvent_End); };
	window.addEventListener("mousemove", onMouseMove, false);
	gfx.canvas.addEventListener("mousedown", onMouseDown, false);
	window.addEventListener("mouseup", onMouseUp, false);
	gfx.canvas.addEventListener("contextmenu", (event) => { event.preventDefault(); }, false);

	let onWindowFocus = () => {
		input.onFocus();
		console.log('OnFocus');
	};
	window.addEventListener('focus', onWindowFocus, false);

	// Keyboard controller
	document.addEventListener('keydown', function(event) {
		let key = event.key.toUpperCase();
		if (key == 'R') {
			// Reset the sim
		}
	}, true);
	document.addEventListener('keyup', function(event) {
	}, true);

	//-----------------------------
	// Kick off an update loop
	window.requestAnimationFrame(update);
});
