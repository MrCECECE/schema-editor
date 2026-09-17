import { getCanvas } from "./editor.js";

let activeObject = null;
let el = {};
let syncLock = false;
let initialized = false;

function getThemeColors() {
    const style = getComputedStyle(document.body);
    return {
        stroke: style.getPropertyValue("--obj-stroke").trim() || "#000000",
        fill: style.getPropertyValue("--obj-fill").trim() || "#000000",
    };
}

export function initToolbarUI() {
    if (initialized) return;
    el = {
        noSel: document.getElementById("props-no-selection"),
        sel: document.getElementById("props-selection"),
        fill: document.getElementById("prop-fill"),
        stroke: document.getElementById("prop-stroke"),
        strokeWidth: document.getElementById("prop-stroke-width"),
        fontSize: document.getElementById("prop-font-size"),
        opacity: document.getElementById("prop-opacity"),
        angle: document.getElementById("prop-angle"),
        locked: document.getElementById("prop-locked"),
    };
    bindPropertyInputs();
    document.addEventListener("selection:changed", onSelectionChanged);
    document.addEventListener("canvas:refresh-selection", onSelectionChanged);
    initialized = true;
    onSelectionChanged();
}

function onSelectionChanged() {
    const canvas = getCanvas();
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    activeObject = obj;
    if (!el.noSel || !el.sel) return;
    if (!obj) {
        el.noSel.classList.remove("hidden");
        el.sel.classList.add("hidden");
        return;
    }
    el.noSel.classList.add("hidden");
    el.sel.classList.remove("hidden");
    syncProperties(obj);
}

function syncProperties(obj) {
    syncLock = true;
    const theme = getThemeColors();
    const iterObj = obj.type === "activeSelection" ? (obj.getObjects()[0] || obj) : obj;
    if (el.fill) el.fill.value = (iterObj.fill && iterObj.fill !== "") ? iterObj.fill : theme.fill;
    if (el.stroke) el.stroke.value = (iterObj.stroke && iterObj.stroke !== "") ? iterObj.stroke : theme.stroke;
    if (el.strokeWidth) el.strokeWidth.value = iterObj.strokeWidth != null ? iterObj.strokeWidth : 0;
    if (el.fontSize) el.fontSize.value = iterObj.fontSize != null ? iterObj.fontSize : 20;
    if (el.opacity) el.opacity.value = obj.opacity != null ? obj.opacity : 1;
    if (el.angle) el.angle.value = obj.angle || 0;
    if (el.locked) el.locked.checked = !!(obj.lockMovementX && obj.lockMovementY);
    syncLock = false;
}

function bindPropertyInputs() {
    const onInput = (prop, getter) => {
        const input = el[prop];
        if (!input) return;
        input.addEventListener("input", () => {
            if (syncLock || !activeObject) return;
            applyToObjects(prop, getter());
        });
        input.addEventListener("change", () => {
            const canvas = getCanvas();
            if (!canvas) return;
            canvas.requestRenderAll();
            document.dispatchEvent(new CustomEvent("canvas:dirty"));
            document.dispatchEvent(new CustomEvent("history:request"));
        });
    };
    onInput("fill", () => el.fill.value);
    onInput("stroke", () => el.stroke.value);
    onInput("strokeWidth", () => parseFloat(el.strokeWidth.value));
    onInput("fontSize", () => parseFloat(el.fontSize.value));
    onInput("opacity", () => parseFloat(el.opacity.value));
    onInput("angle", () => parseFloat(el.angle.value));
    onInput("locked", () => el.locked.checked);
}

function applyToObjects(prop, value) {
    const canvas = getCanvas();
    const obj = activeObject;
    if (!obj) return;
    const objects = obj.type === "activeSelection" ? obj.getObjects() : [obj];

    objects.forEach((o) => {
        switch (prop) {
            case "fill": o.set({ fill: value }); break;
            case "stroke": o.set({ stroke: value }); break;
            case "strokeWidth": o.set({ strokeWidth: value }); break;
            case "fontSize": if (o.fontSize != null) o.set({ fontSize: value }); break;
            case "opacity": o.set({ opacity: value }); break;
            case "angle": o.set({ angle: value }); break;
            case "locked":
                o.set({
                    lockMovementX: value,
                    lockMovementY: value,
                    hasControls: !value,
                    hasBorders: !value,
                    lockRotation: value,
                    lockScalingX: value,
                    lockScalingY: value,
                });
                break;
        }
    });
    canvas.requestRenderAll();
}