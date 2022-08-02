// We're just a shim that passes messages to and from our wasm module.

//-----------------------------------------------------------------------------
// Wasm module loading and init
//-----------------------------------------------------------------------------
var HEAPU8 = null;
var env = {};
var wasmInstance = null;
function initWasm(wasmUrl, memory, threadId, STACK_SIZE) {
	HEAPU8 = new Uint8Array(memory.buffer);
	env['memory'] = memory;
	// Provide some helper functions, mainly filling in libc functionality
	env['abort'] = function abort() {
		throw 'wasm aborted!';
	};
	env['acos'] = function acos(x) { return Math.acos(x); };
	env['acosh'] = function acosh(x) { return Math.acosh(x); };
	env['asin'] = function asin(x) { return Math.asin(x); };
	env['asinh'] = function asinh(x) { return Math.asinh(x); };
	env['atan'] = function atan(x) { return Math.atan(x); };
	env['atanh'] = function atanh(x) { return Math.atanh(x); };
	env['atan2'] = function atan2(x, y) { return Math.atan2(x, y); };
	env['cos'] = function cos(x) { return Math.cos(x); };
	env['cosh'] = function cosh(x) { return Math.cosh(x); };
	env['exp'] = function exp(x) { return Math.exp(x); };
	env['exp2'] = function exp2(x) { return 2 ** x; }; // This is how Javscript does exp2
	env['log'] = function log(x) { return Math.log(x); };
	env['log2'] = function log2(x) { return Math.log2(x); };
	env['pow'] = function pow(x, y) { return Math.pow(x, y); };
	env['round'] = function round(x) { return Math.round(x); };
	env['sin'] = function sin(x) { return Math.sin(x); };
	env['sinh'] = function sinh(x) { return Math.sinh(x); };
	env['tan'] = function tan(x) { return Math.tan(x); };
	env['tanh'] = function tanh(x) { return Math.tanh(x); };
	// Extra helper functionality exposure
	var UTF8Decoder = new TextDecoder();
	env['puts'] = function puts(cstr) {
		let length = 0;
		while (HEAPU8[cstr + length] != 0) { ++length; }
		let msg = UTF8Decoder.decode(HEAPU8.subarray(cstr, cstr+length).slice());
		console.log(msg);
	};
	env['performance_now'] = function performance_now() {
		return performance.now();
	};
	// Actually load up the code
	wasmInstance = null;
	//console.log(`Worker: Attempting to load wasm on thread ${threadId} ...`);
	fetch(wasmUrl).then(function(response) {
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		response.arrayBuffer().then(function(buffer) {
			WebAssembly.instantiate(buffer, { 'env': this.env }).then((result) => {
				wasmInstance = result.instance;
				if (threadId == 0) {
					wasmInstance.exports.wasm_entry();
		            wasmInstance.exports.Initialize();
		            // Grab the serialized tweak data information and pass it back to the main thread
					let tweakAddr = wasmInstance.exports.GetTweakPtr();
					let size = (new Uint32Array(HEAPU8.buffer, tweakAddr, 1))[0];
					let tweakResult = HEAPU8.subarray(tweakAddr, tweakAddr + size).slice();
	            	postMessage({type: MSG_TWEAK_RESULT, tweakResult});
				} else {
					wasmInstance.exports.SetThreadShadowStackPointer(threadId, STACK_SIZE);
		            wasmInstance.exports.ThreadMain(threadId);
				}
			});
		});
	});
}

//-----------------------------------------------------------------------------
// Main thread communication
//-----------------------------------------------------------------------------
// Handler for messages coming from the main thread
const MSG_INIT_WASM = 0;
const MSG_TERM_WASM = 1;
const MSG_RPC = 2;
const MSG_FRAME = 3;
const MSG_TWEAK_RESULT = 4;
const MSG_SIM_RESULT = 5;

const kSimResultSize = (16 * 32 * 1024) + (16 * 512 * 1024) + (4 * 2048 * 1024) + (1024);
var simResults = [new ArrayBuffer(kSimResultSize), new ArrayBuffer(kSimResultSize)];

var frameCount = 0;
var frameTimes = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
var sortedFrameLengths = [0.0, 0.0, 0.0, 0.0, 0.0];
function pushFrameTime(newTime) {
	for (let i = 1; i < 6; i++) { frameTimes[i - 1] = frameTimes[i]; }
	frameTimes[5] = newTime;
}
function medianFrameLength() {
	if (frameCount < 6) { return 1.0 / 60.0; } // Without enough real samples, assume 60Hz
	for (let i = 1; i < 6; i++) {
		sortedFrameLengths[i - 1] = frameTimes[i] - frameTimes[i - 1];
	}
	sortedFrameLengths.sort((a,b) => a-b);
	return sortedFrameLengths[2];
}

let msgs = {};

msgs[MSG_INIT_WASM] = function msgs_INIT_WASM(msg) {
	initWasm(msg.wasmUrl, msg.memory, msg.threadId, msg.STACK_SIZE);
};

msgs[MSG_TERM_WASM] = function msgs_TERM_WASM(msg) {
	if (wasmInstance) {
		wasmInstance.exports.Terminate();
	}
};

let rpcBacklog = [];
msgs[MSG_RPC] = function msgs_RPC(msg) {
	if (!wasmInstance) {
		rpcBacklog.push(msg);
	} else {
		wasmInstance.exports[msg.name](...msg.args);
	}
};

msgs[MSG_FRAME] = function msgs_FRAME(msg) {
	let timestamp = performance.now();
	++frameCount;
	pushFrameTime(msg.timestamp);
	// If sim updates are going long, it's possible for multiple frame msgs to build up,
	// in which case we want to attempt to ignore all but the last
	let medianFrame = medianFrameLength();
	if (timestamp - msg.timestamp > 1.25 * medianFrame) { return; }
	// If we grossly mispredict frame time, it's still possible we can end up trying to
	// run a sim frame without an available results buffer. Just wait a bit and one will come
	if (!simResults[0]) { return; }

	// Can't do any additional work until the wasm module is loaded
	if (!wasmInstance) { return; }

	// Tell C++ to update
	wasmInstance.exports.Update(0.001 * timestamp, 0.001 * medianFrame); // C++ likes seconds, not milliseconds

	// Copy data out into our simResults buffer
	let arrayAddr = wasmInstance.exports.GetGfxPtrArray();
	let ptrs = new Uint32Array(HEAPU8.buffer, arrayAddr, 4);
	let results8 = new Uint8Array(simResults[0]);
	let head = 0;
	// Uniforms:
	results8.set(HEAPU8.subarray(ptrs[0], ptrs[0] + 4 * 2 * 16), head);
	head += 4 * 2 * 16;
	// Points:
	let pointCount = new Uint32Array(HEAPU8.buffer, ptrs[1], 1)[0];
	results8.set(HEAPU8.subarray(ptrs[1], ptrs[1] + 4 + 16 * pointCount), head);
	head += 4 + 16 * pointCount;
	// Verts:
	let vertCount = new Uint32Array(HEAPU8.buffer, ptrs[2], 1)[0];
	results8.set(HEAPU8.subarray(ptrs[2], ptrs[2] + 4 + 16 * vertCount), head);
	head += 4 + 16 * vertCount;
	// Idxs:
	let idxCount = new Uint32Array(HEAPU8.buffer, ptrs[3], 1)[0];
	results8.set(HEAPU8.subarray(ptrs[3], ptrs[3] + 4 + 4 * idxCount), head);
	head += 4 + 4 * idxCount;

	// Transfer the results to the main thread
	postMessage({type: MSG_SIM_RESULT, simResult: simResults[0]}, [simResults[0]]);
	simResults[0] = simResults[1];
	simResults[1] = null;
};

msgs[MSG_SIM_RESULT] = function msgs_SIM_RESULT(msg) {
	simResults[!simResults[0] ? 0 : 1] = msg.simResult;
};

onmessage = function(e) {
	if (rpcBacklog && wasmInstance) {
		for (let i = 0; i < rpcBacklog.length; i++) {
			let rpc = rpcBacklog[i];
			let rpcFn = wasmInstance.exports[rpc.name];
			if (rpcFn) {
				rpcFn(...rpc.args);
			} else {
				console.error(`RPC error: No WASM functioned called ${rpc.name}`);
			}
		}
		rpcBacklog = null;
	}

	let msg = e.data;
	msgs[msg.type](msg);
};
