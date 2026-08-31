import { getCanvas } from "./editor.js";

let activeObject = null;

const propsNoSel = document.getElementById("props-no-selection");
const propsSel = document.getElementById("props-selection");
const el = {
    fill: document.getElementById("prop-fill"),
    stroke: document.getElementById("prop-stroke"),
    strokeWidth: document.getElementById("prop-stroke-width"),
    fontSize: document.getElementById("prop-font-size"),
    opacity: document.getElementById("prop-opacity"),
    angle: document.getElementById("prop-angle"),
    locked: document.getElementById("prop-locked"),
};

let syncLock = false;

export function initToolbarUI() {
    bindPropertyInputs();
    document.addEventListener("selection:changed", onSelectionChanged);
}

function onSelectionChanged() {
    const canvas = getCanvas();
    const obj = canvas.getActiveObject();
    activeObject = obj;
    if (!obj) {
        propsNoSel.classList.remove("hidden");
        propsSel.classList.add("hidden");
        return;
    }
    propsNoSel.classList.add("hidden");
    propsSel.classList.remove("hidden");
    syncProperties(obj);
}

function syncProperties(obj) {
    syncLock = true;
    const iterObj = obj.type === "activeSelection" ? obj.getObjects()[0] || obj : obj;
    el.fill.value = iterObj.fill && iterObj.fill !== "" ? iterObj.fill : "#000000";
    el.stroke.value = iterObj.stroke && iterObj.stroke !== "" ? iterObj.stroke : "#000000";
    el.strokeWidth.value = iterObj.strokeWidth != null ? iterObj.strokeWidth : 0;
    el.fontSize.value = iterObj.fontSize != null ? iterObj.fontSize : 20;
    el.opacity.value = obj.opacity != null ? obj.opacity : 1;
    el.angle.value = obj.angle || 0;
    el.locked.checked = !!obj.lockMovementX && !!obj.lockMovementY;
    syncLock = false;
}

function bindPropertyInputs() {
    el.fill.addEventListener("input", () => {
        if (syncLock || !activeObject) return;
        applyToObjects("fill", el.fill.value);
    });
    el.stroke.addEventListener("input", () => {
        if (syncLock || !activeObject) return;
        applyToObjects("stroke", el.stroke.value);
    });
    el.strokeWidth.addEventListener("input", () => {
        if (syncLock || !activeObject) return;
        applyToObjects("strokeWidth", parseFloat(el.strokeWidth.value));
    });
    el.fontSize.addEventListener("input", () => {
        if (syncLock || !activeObject) return;
        applyToObjects("fontSize", parseFloat(el.fontSize.value));
    });
    el.opacity.addEventListener("input", () => {
        if (syncLock || !activeObject) return;
        applyToObjects("opacity", parseFloat(el.opacity.value));
    });
    el.angle.addEventListener("input", () => {
        if (syncLock || !activeObject) return;
        applyToObjects("angle", parseFloat(el.angle.value));
    });
    el.locked.addEventListener("change", () => {
        if (syncLock || !activeObject) return;
        applyToObjects("locked", el.locked.checked);
    });

    ["fill", "stroke", "strokeWidth", "fontSize", "opacity", "angle", "locked"].forEach((name) => {
        const input = el[name];
        input.addEventListener("change", () => {
            const canvas = getCanvas();
            canvas.requestRenderAll();
            document.dispatchEvent(new CustomEvent("canvas:dirty"));
            document.dispatchEvent(new CustomEvent("history:request"));
        });
    });
}

function applyToObjects(prop, value) {
    const canvas = getCanvas();
    const obj = activeObject;
    const objects = obj.type === "activeSelection" ? obj.getObjects() : [obj];

    objects.forEach((o) => {
        switch (prop) {
            case "fill":
                o.set({ fill: value });
                break;
            case "stroke":
                o.set({ stroke: value });
                break;
            case "strokeWidth":
                o.set({ strokeWidth: value });
                break;
            case "fontSize":
                if (o.fontSize != null) o.set({ fontSize: value });
                break;
            case "opacity":
                o.set({ opacity: value });
                break;
            case "angle":
                o.set({ angle: value });
                break;
            case "locked":
                o.set({ lockMovementX: value, lockMovementY: value, hasControls: !value, hasBorders: !value, lockRotation: value, lockScalingX: value, lockScalingY: value });
                break;
        }
    });
    canvas.requestRenderAll();
}
