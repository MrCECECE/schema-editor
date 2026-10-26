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
    const styleObj = firstStyleTarget(obj);
    if (el.fill) el.fill.value = (styleObj.fill && styleObj.fill !== "") ? styleObj.fill : theme.fill;
    if (el.stroke) el.stroke.value = (styleObj.stroke && styleObj.stroke !== "") ? styleObj.stroke : theme.stroke;
    if (el.strokeWidth) el.strokeWidth.value = styleObj.strokeWidth != null ? styleObj.strokeWidth : 0;
    if (el.fontSize) el.fontSize.value = styleObj.fontSize != null ? styleObj.fontSize : 20;
    if (el.opacity) el.opacity.value = obj.opacity != null ? obj.opacity : 1;
    if (el.angle) el.angle.value = obj.angle || 0;
    if (el.locked) el.locked.checked = !!(obj.lockMovementX && obj.lockMovementY);
    syncLock = false;
}

function firstStyleTarget(obj) {
    if (obj.type === "activeSelection" || obj.type === "group") {
        const kids = obj.getObjects ? obj.getObjects() : [];
        return kids.find((o) => o.stroke || o.fill) || obj;
    }
    return obj;
}

function bindPropertyInputs() {
    const onInput = (prop, getter) => {
        const input = el[prop];
        if (!input) return;
        input.addEventListener("input", () => {
            if (syncLock || !activeObject) return;
            applyToObjects(prop, getter());
            // Помечаем документ изменённым сразу, не дожидаясь blur/change.
            document.dispatchEvent(new CustomEvent("canvas:dirty"));
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

    const selected = obj.type === "activeSelection" ? obj.getObjects() : [obj];

    selected.forEach((node) => {
        if (prop === "fill" || prop === "stroke" ||
            prop === "strokeWidth" || prop === "fontSize") {
            // Для групп (в т.ч. стрелок) правим листья, а не саму группу:
            // у группы нет собственных fill/stroke.
            const leaves = node.type === "group" ? (node.getObjects?.() || []) : [node];
            leaves.forEach((leaf) => applyLeaf(leaf, prop, value));
        } else {
            applyNode(node, prop, value);
        }
        node.setCoords?.();
    });

    if (typeof obj.setCoords === "function") obj.setCoords();
    canvas.requestRenderAll();
}

function applyLeaf(leaf, prop, value) {
    switch (prop) {
        case "fill":
            leaf.set({fill: value});
            break;
        case "stroke":
            leaf.set({stroke: value});
            // Наконечник стрелки нарисован заливкой без обводки.
            if (leaf.shapeType === "arrowHead") leaf.set({fill: value});
            break;
        case "strokeWidth":
            leaf.set({strokeWidth: value});
            break;
        case "fontSize":
            if (leaf.fontSize != null) {
                leaf.set({fontSize: value});
                if (typeof leaf.initDimensions === "function") leaf.initDimensions();
            }
            break;
    }
}

function applyNode(node, prop, value) {
    switch (prop) {
        case "opacity":
            node.set({opacity: value});
            break;
        case "angle":
            // rotate() вращает вокруг центра, set({angle}) — вокруг origin.
            if (typeof node.rotate === "function") node.rotate(value);
            else node.set({angle: value});
            break;
        case "locked":
            node.set({
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
}