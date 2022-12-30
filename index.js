"use strict";

let whileKeyDown = (() => {
    let handlers = {};
    let intervals = {};
    let handleKey = (event) => event.code in handlers ? handlers[event.code].forEach(handler => handler(event)) : null
    document.addEventListener("keydown", (e) => {
        if (e.code in intervals) return;
        intervals[e.code] = setInterval(() => handleKey(e), 10);
    })
    document.addEventListener("keyup", (e) => {
        if (!(e.code in intervals)) return;
        clearInterval(intervals[e.code])
        delete intervals[e.code]
    })
    return function whileKeyDown (keycode, handler) {
        if (Array.isArray(keycode)) return keycode.forEach(code => whileKeyDown(code, handler))
        if (!Array.isArray(handlers[keycode])) handlers[keycode] = []
        handlers[keycode].push(handler)
    }
})()

class DualKernel {
    accelerated = true;
    functions = [];
    resolution = 1;
    setShader (shader, constants = {}) {
        if (!(shader instanceof Function)) throw new Error("invalid shader function.");
        constants.width = this.canvases.gpu.width;
        constants.height = this.canvases.gpu.height;
        const ctx = this.canvases.cpu.getContext("2d");
        this.kernels = {
            gpu: this.gpu.createKernel(shader)
                .setOutput([this.canvases.gpu.width, this.canvases.gpu.height])
                .setGraphical(true)
                .setFixIntegerDivisionAccuracy(true)
                .setTactic('precision')
                .setConstants(constants)
                .setLoopMaxIterations(10000),
            cpu: (...args) => {
                eval(this.functions.map(func => func.toString()).join("\n") + "\n" + `
                    let { width, height } = this.canvases.cpu;
                    for (let x = 0; x < width; x+=${this.resolution}) {
                        for (let y = 0; y < height; y+=${this.resolution}) {
                            let color = (r, g, b) => (ctx.fillStyle = \`rgb(\${r * 255}, \${g * 255}, \${b * 255})\`) && ctx.fillRect(x, y, ${this.resolution}, ${this.resolution})
                            shader.bind({ constants: { ...constants, width: width, height: height }, color, thread: {x, y} })(...args)
                        }
                    }
                `)
            }
        }
        this.functions.forEach(f => this.kernels.gpu.addFunction(f))
        return this;
    }
    constructor (cpucanvas, gpucanvas) {
        this.canvases = {
            cpu: typeof cpucanvas === "string" ? document.getElementById(cpucanvas) : cpucanvas,
            gpu: typeof gpucanvas === "string" ? document.getElementById(gpucanvas) : gpucanvas
        }
        this.gpu = new GPU({canvas: this.canvases.gpu});
    }
    render (...args) {
        if (!this.kernels) throw new Error("no shader set.");
        ;( this.kernels[this.accelerated ? "gpu" : "cpu"] )(...args);
        return this;
    }
    /**
     * 
     * @param {"gpu" | "cpu"} mode 
     * @returns {DualKernel}
     */
    setMode (mode) {
        this.accelerated = mode === "cpu" ? false : true;
        // make unused one disappear later
        if (this.accelerated) {
            this.canvases.gpu.style.visibility = 'visible'
            this.canvases.cpu.style.visibility = 'hidden'
        }
        else {
            this.canvases.gpu.style.visibility = 'hidden'
            this.canvases.cpu.style.visibility = 'visible'
        }
        return this;
    }
    addFunction (func) {
        if (!func.name) throw new Error("no function name")
        this.functions.push(func)
        return this;
    }
    delFunction (name) {
        throw new Error("unimplemented")
        let index = this.functions.indexOf(this.functions.find(f => f.name === name))
        if (!index) return false;
        this.functions.splice(index, 1)
        return true;
    }
    /**
     * @param {number} px 
     * @returns {DualKernel}
     */
    setCPUResolution(px) {
        this.resolution = px
        return this;
    }
}

function add (a, b) { return [ a[0] + b[0], a[1] + b[1] ] }
function multiply (a, b) { return [ a[0]*b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0] ] }
function sine (a) { return [ Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1]) ] }
// function scale (number, oldbounds, newbounds) { return 1.0 * ((number - oldbounds[0]) / (oldbounds[1] - oldbounds[0])) * ( newbounds[1] - newbounds[0] ) + newbounds[0] } 

// anything in here MUST be gpu.js compatible
/**
 * @param {[number, number]} center 
 * @param {number} zoom scale of the viewport; a decimal
 */
function shader (center, zoom, iterations) {
    let i = 0;
    let z = [0.0, 0.0]
    let bounds = [
        [
            (-2.0 * zoom) + center[0],
            (2.0 * zoom) + center[0]
        ],
        [
            (-2.0 * zoom) + center[1],
            (2.0 * zoom) + center[1]
        ]
    ]
    let ratio = (this.constants.width / this.constants.height);
    let c = [
        (this.thread.x / this.constants.width) * (bounds[0][1] - bounds[0][0]) + bounds[0][0],
        (this.thread.y / this.constants.height) * (bounds[1][1] - bounds[1][0]) + bounds[1][0]
    ]
    c[0] = c[0] * ratio;
    
    while (i < iterations && (z[0] * z[0]) + (z[1] * z[1]) < Infinity) {
        i += 1;
        z = add(sine(z), c);
    }
    this.color(0, Math.sin(i), Math.cos(i))
    //this.color(1 - ((this.thread.x / this.constants.width) + (this.thread.y / this.constants.height)) / 2, this.thread.x / this.constants.width, this.thread.y / this.constants.height)
}

let renderer = new DualKernel("cpu", "gpu")
    .addFunction(add)
    .addFunction(multiply)
    .addFunction(sine)
    .setShader(shader)
    .setMode("gpu")
    .setCPUResolution(10)

let center = [0, 0];
let scale = 1;
let zoomSpeed = 0.05
let moveSpeed = 0.075
let render = () => renderer.render(center, scale, 200)
let translate = (axis, change) => (center[axis === "x" ? 0 : 1] += change * (axis === "x" ? (window.innerHeight * scale) / window.innerWidth : scale)) && render();
let zoom = (amount) => (scale += amount * scale) && render() && console.log(scale);

whileKeyDown(["KeyW", "ArrowUp"], () => translate("y", moveSpeed))
whileKeyDown(["KeyS", "ArrowDown"], () => translate("y", -moveSpeed))
whileKeyDown(["KeyA", "ArrowLeft"], () => translate("x", -moveSpeed))
whileKeyDown(["KeyD", "ArrowRight"], () => translate("x", moveSpeed))
whileKeyDown("Equal", () => zoom(-zoomSpeed))
whileKeyDown("Minus", () => zoom(zoomSpeed))
render();