export const GRID_SIZE = 20;

let canvas = null;
let currentTool = "select";
let gridEnabled = true;

let isDrawingLine = null;   // { startX, startY, tool, shape? }
let drawStart = null;       // { x, y, shape? }
let panState = null;        // { startX, startY, startVpt }
let prevToolBeforeSpace = null;
let viewOnly = false;

function getThemeColors() {
    const style = getComputedStyle(document.body);
    return {
        stroke: style.getPropertyValue("--obj-stroke").trim() || "#ffffff",
        fill: style.getPropertyValue("--obj-fill").trim() || "#4a90d9",
        text: style.getPropertyValue("--obj-text").trim() || "#ffffff",
        pencil: style.getPropertyValue("--pencil-color").trim() || "#ffffff",
    };
}

function normalizeColor(color) {
    if (!color) return "";
    if (color.startsWith("#")) return color.toLowerCase();
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
        const r = parseInt(match[1], 10).toString(16).padStart(2, "0");
        const g = parseInt(match[2], 10).toString(16).padStart(2, "0");
        const b = parseInt(match[3], 10).toString(16).padStart(2, "0");
        return "#" + r + g + b;
    }
    return color.toLowerCase();
}

export function getCanvasBgColor() {
    const style = getComputedStyle(document.body);
    return style.getPropertyValue("--canvas-bg").trim() || "#111118";
}

export function initEditor() {
    canvas = new fabric.Canvas("schema-canvas", {
        selection: true,
        preserveObjectStacking: true,
        width: 1000,
        height: 700,
        renderOnAddRemove: false,
    });

    const theme = getThemeColors();
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = theme.pencil;
    canvas.freeDrawingBrush.width = 2;

    installGridBackground();
    bindCanvasEvents();
    bindSpacePan();
    return canvas;
}

export function getCanvas() { return canvas; }

export function setCurrentTool(tool) {
    currentTool = tool;
    if (!canvas) return;
    canvas.selection = !viewOnly && tool === "select";
    canvas.isDrawingMode = !viewOnly && tool === "pencil";
    // В view-only режиме и в режиме руки не нужно искать цели под курсором
    canvas.skipTargetFind = viewOnly || (tool !== "select" && tool !== "eraser");
    canvas.defaultCursor =
        tool === "hand" ? "grab" :
            tool === "select" ? "default" :
                "crosshair";
    if (!viewOnly) canvas.discardActiveObject();
    canvas.renderAll();
}

export function setViewOnlyMode(on) {
    viewOnly = !!on;
    if (canvas) {
        canvas.selection = !viewOnly && currentTool === "select";
        canvas.skipTargetFind = viewOnly || (currentTool !== "select" && currentTool !== "eraser");
        if (!viewOnly) canvas.discardActiveObject();
        canvas.requestRenderAll();
    }
}

export function getCurrentTool() { return currentTool; }

function snap(value) {
    if (!gridEnabled) return value;
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function applyGrid(enable) {
    gridEnabled = enable;
    if (canvas) canvas.requestRenderAll();
}

export function toggleGrid() {
    applyGrid(!gridEnabled);
    return gridEnabled;
}

export function isGridEnabled() { return gridEnabled; }

function installGridBackground() {
    canvas._renderBackground = function (ctx) {
        const w = this.getWidth();
        const h = this.getHeight();
        const bg = getCanvasBgColor();
        ctx.save();
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
        if (!gridEnabled) return;

        const gridStroke = getComputedStyle(document.body).getPropertyValue("--grid-stroke").trim() || "#26264a";
        const vpt = this.viewportTransform || [1, 0, 0, 1, 0, 0];
        const zoom = Math.abs(vpt[0]) || 1;
        const step = GRID_SIZE * zoom;
        const x0 = vpt[4] ? -vpt[4] : 0;
        const y0 = vpt[5] ? -vpt[5] : 0;

        ctx.save();
        ctx.beginPath();
        for (let k = Math.ceil(-x0 / step); k <= Math.floor((w - x0) / step); k++) {
            const px = x0 + k * step;
            ctx.moveTo(px, 0);
            ctx.lineTo(px, h);
        }
        for (let k = Math.ceil(-y0 / step); k <= Math.floor((h - y0) / step); k++) {
            const py = y0 + k * step;
            ctx.moveTo(0, py);
            ctx.lineTo(w, py);
        }
        ctx.strokeStyle = gridStroke;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    };
}

function bindCanvasEvents() {
    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);
    canvas.on("mouse:dblclick", onDoubleClick);
    canvas.on("mouse:wheel", onMouseWheel);
    canvas.on("object:moving", onObjectMoving);
    canvas.on("selection:created", () => document.dispatchEvent(new CustomEvent("selection:changed")));
    canvas.on("selection:updated", () => document.dispatchEvent(new CustomEvent("selection:changed")));
    canvas.on("selection:cleared", () => document.dispatchEvent(new CustomEvent("selection:changed")));
    canvas.on("object:added", markDirty);
    canvas.on("object:modified", () => { markDirty(); saveUndo(); });
    canvas.on("object:removed", () => { markDirty(); saveUndo(); });
    canvas.on("path:created", () => { markDirty(); saveUndo(); });
}

function bindSpacePan() {
    document.addEventListener("keydown", (e) => {
        if (e.code !== "Space") return;
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (active && active.isEditing) return;
        e.preventDefault();
        if (prevToolBeforeSpace) return;
        prevToolBeforeSpace = currentTool;
        setCurrentTool("hand");
    });
    document.addEventListener("keyup", (e) => {
        if (e.code !== "Space") return;
        if (!prevToolBeforeSpace) return;
        const tool = prevToolBeforeSpace;
        prevToolBeforeSpace = null;
        setCurrentTool(tool);
    });
}

export function markDirty() {
    document.dispatchEvent(new CustomEvent("canvas:dirty"));
}

function onMouseDown(opt) {
    const e = opt.e;

    // Панорамирование (средняя кнопка мыши или инструмент "рука")
    // должно работать и в view-only режиме.
    if (e.button === 1 || currentTool === "hand") {
        panState = {
            startX: e.clientX,
            startY: e.clientY,
            startVpt: canvas.viewportTransform.slice(),
        };
        canvas.setCursor("grabbing");
        e.preventDefault();
        return;
    }

    // Всё остальное — только для редактирования.
    if (viewOnly) return;

    const pointer = canvas.getPointer(opt.e);
    const x = snap(pointer.x);
    const y = snap(pointer.y);

    if (currentTool === "eraser") {
        const target = canvas.findTarget(opt.e, true);
        if (target) {
            canvas.remove(target);
            canvas.requestRenderAll();
        }
        return;
    }

    if (currentTool === "line" || currentTool === "arrow") {
        if (!isDrawingLine) {
            isDrawingLine = { startX: x, startY: y, tool: currentTool };
        }
        return;
    }

    if (["rectangle", "diamond", "circle"].includes(currentTool)) {
        drawStart = { x, y };
    }
}

function onMouseMove(opt) {
    const e = opt.e;

    if (panState) {
        // Меняем ТОЛЬКО сдвиг (vpt[4]/vpt[5]), масштаб (vpt[0]/vpt[3]) не трогаем.
        const vpt = canvas.viewportTransform.slice();
        vpt[4] = panState.startVpt[4] + (e.clientX - panState.startX);
        vpt[5] = panState.startVpt[5] + (e.clientY - panState.startY);
        canvas.setViewportTransform(vpt);
        canvas.requestRenderAll();
        return;
    }

    const pointer = canvas.getPointer(opt.e);
    document.dispatchEvent(new CustomEvent("coords:update", {
        detail: { x: Math.round(pointer.x), y: Math.round(pointer.y) },
    }));

    if (viewOnly) return;

    if (isDrawingLine) {
        const x = snap(pointer.x);
        const y = snap(pointer.y);
        const theme = getThemeColors();
        if (!isDrawingLine.shape) {
            const line = new fabric.Line(
                [isDrawingLine.startX, isDrawingLine.startY, x, y],
                {
                    stroke: theme.stroke,
                    strokeWidth: 2,
                    selectable: false,
                    evented: false,
                    originX: "center",
                    originY: "center",
                }
            );
            line.set({ excludeFromExport: true });
            isDrawingLine.shape = line;
            canvas.add(line);
        } else {
            isDrawingLine.shape.set({ x2: x, y2: y });
            canvas.requestRenderAll();
        }
    }

    if (drawStart && ["rectangle", "diamond", "circle"].includes(currentTool)) {
        const x = snap(pointer.x);
        const y = snap(pointer.y);
        if (!drawStart.shape) {
            const shape = createShape(currentTool, drawStart.x, drawStart.y, x, y);
            drawStart.shape = shape;
            canvas.add(shape);
        } else {
            updateShape(drawStart.shape, currentTool, drawStart.x, drawStart.y, x, y);
            canvas.requestRenderAll();
        }
    }
}

function onMouseUp(opt) {
    if (panState) {
        panState = null;
        canvas.setCursor(currentTool === "hand" ? "grab" :
            currentTool === "select" ? "default" : "crosshair");
        return;
    }

    if (viewOnly) return;

    if (isDrawingLine && isDrawingLine.shape) {
        const shape = isDrawingLine.shape;
        shape.set({ excludeFromExport: false, selectable: true, evented: true });
        if (isDrawingLine.tool === "arrow") {
            canvas.remove(shape);
            const arrow = createArrow(shape.x1, shape.y1, shape.x2, shape.y2);
            canvas.add(arrow);
        }
        isDrawingLine = null;
        markDirty();
        saveUndo();
        canvas.requestRenderAll();
        return;
    }
    isDrawingLine = null;

    if (drawStart && drawStart.shape) {
        const shape = drawStart.shape;
        if (shape.width <= GRID_SIZE / 2 && shape.height <= GRID_SIZE / 2) {
            canvas.remove(shape);
        }
        markDirty();
        saveUndo();
        canvas.requestRenderAll();
    }
    drawStart = null;
}

function onDoubleClick(opt) {
    if (viewOnly) return;
    const target = canvas.findTarget(opt.e);
    if (target && target.type === "i-text") {
        canvas.setActiveObject(target);
        target.enterEditing();
        target.selectAll();
    }
}

function onMouseWheel(opt) {
    const e = opt.e;
    if (e.ctrlKey) return;

    let zoom = canvas.getZoom() * (0.999 ** e.deltaY);
    if (zoom > 10) zoom = 10;
    if (zoom < 0.1) zoom = 0.1;

    // offsetX/offsetY — экранные координаты относительно upper-canvas.
    // getPointer(e) тут использовать нельзя: он вернёт мировые координаты,
    // и zoomToPoint применит inverse viewportTransform второй раз.
    canvas.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), zoom);
    canvas.requestRenderAll();

    e.preventDefault();
    e.stopPropagation();
    updateZoomUI();
}

function onObjectMoving(e) {
    const obj = e.target;
    if (!obj) return;
    const left = snap(obj.left);
    const top = snap(obj.top);
    obj.set({ left, top });
}

function createShape(tool, x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    const theme = getThemeColors();

    switch (tool) {
        case "rectangle":
            return new fabric.Rect({
                left, top, width, height,
                fill: theme.fill, stroke: theme.stroke, strokeWidth: 2,
            });
        case "diamond": {
            const path = new fabric.Path(
                `M ${width / 2} 0 L ${width} ${height / 2} L ${width / 2} ${height} L 0 ${height / 2} Z`,
                {
                    fill: theme.fill,
                    stroke: theme.stroke,
                    strokeWidth: 2,
                    left,
                    top,
                }
            );
            path.set({ shapeType: "diamond" });
            return path;
        }
        case "circle":
            return new fabric.Ellipse({
                left: left + width / 2,
                top: top + height / 2,
                rx: width / 2,
                ry: height / 2,
                fill: theme.fill, stroke: theme.stroke, strokeWidth: 2,
                originX: "center", originY: "center",
            });
    }
}

function updateShape(shape, tool, x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);

    if (tool === "rectangle") {
        shape.set({ left, top, width, height });
    } else if (tool === "diamond") {
        shape.path = [
            ["M", width / 2, 0],
            ["L", width, height / 2],
            ["L", width / 2, height],
            ["L", 0, height / 2],
            ["Z"],
        ];
        shape.dirty = true;
        shape.set({ left, top });
        shape._calcBounds();
        shape.setCoords();
    } else if (tool === "circle") {
        shape.set({ rx: width / 2, ry: height / 2 });
        shape.setPositionByOrigin(
            new fabric.Point(left + width / 2, top + height / 2),
            "center", "center"
        );
    }
}

function createArrow(x1, y1, x2, y2) {
    const theme = getThemeColors();
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLength = 14;
    const headAngle = Math.PI / 6;
    const hx = x2 - headLength * Math.cos(angle - headAngle);
    const hy = y2 - headLength * Math.sin(angle - headAngle);
    const line = new fabric.Line(
        [x1, y1,
            x2 - headLength * Math.cos(angle),
            y2 - headLength * Math.sin(angle)],
        { stroke: theme.stroke, strokeWidth: 2, fill: "", selectable: true }
    );
    const head = new fabric.Path(
        `M ${x2} ${y2} L ${hx} ${hy} ` +
        `L ${x2 - headLength * Math.cos(angle + headAngle)} ` +
        `${y2 - headLength * Math.sin(angle + headAngle)} Z`,
        { fill: theme.stroke, stroke: "none", selectable: true }
    );
    return new fabric.Group([line, head], { selectable: true });
}

export function addText(text) {
    const theme = getThemeColors();
    const t = new fabric.IText(text || "Текст", {
        left: 100,
        top: 100,
        fontSize: 20,
        fill: theme.text,
    });
    canvas.add(t);
    canvas.setActiveObject(t);
    canvas.requestRenderAll();
    markDirty();
    saveUndo();
    return t;
}

export function groupSelected() {
    const active = canvas.getActiveObject();
    if (!active) return;
    if (active.type === "activeSelection") {
        const group = active.toGroup();
        canvas.setActiveObject(group);
        group.setCoords();
        canvas.requestRenderAll();
        markDirty();
        saveUndo();
    }
}

export function ungroupSelected() {
    const active = canvas.getActiveObject();
    if (!active || active.type !== "group") return;
    active.toActiveSelection();
    canvas.requestRenderAll();
    markDirty();
    saveUndo();
}

export function deleteSelected() {
    const active = canvas.getActiveObject();
    if (!active) return;
    if (active.type === "activeSelection") {
        active.getObjects().forEach((o) => canvas.remove(o));
        canvas.discardActiveObject();
    } else {
        canvas.remove(active);
    }
    canvas.requestRenderAll();
    markDirty();
    saveUndo();
}

export function setZoom(factor) {
    if (!canvas) return;
    if (factor < 0.1 || factor > 10) return;
    const center = new fabric.Point(canvas.getWidth() / 2, canvas.getHeight() / 2);
    canvas.zoomToPoint(center, factor);
    canvas.requestRenderAll();
    updateZoomUI();
}

export function zoomIn() { if (canvas) setZoom(canvas.getZoom() + 0.1); }
export function zoomOut() { if (canvas) setZoom(canvas.getZoom() - 0.1); }
export function resetZoom() { if (canvas) setZoom(1); }

export function updateZoomUI() {
    if (!canvas) return;
    document.dispatchEvent(new CustomEvent("zoom:changed", {
        detail: { zoom: Math.round(canvas.getZoom() * 100) },
    }));
}

export function saveUndo() {
    document.dispatchEvent(new CustomEvent("history:request"));
}

export function loadFromJSON(data) {
    return new Promise((resolve) => {
        canvas.loadFromJSON(data, () => {
            canvas.renderAll();
            resolve();
        });
    });
}

export function getJSON() { return canvas.toJSON(); }

export function updateObjectsForTheme() {
    if (!canvas) return;
    const theme = getThemeColors();
    canvas.getObjects().forEach((obj) => {
        if (obj.excludeFromExport) return;
        if (obj.type === "group" || obj.type === "activeSelection") {
            obj.getObjects?.().forEach((child) => updateObjectColors(child, theme));
        } else {
            updateObjectColors(obj, theme);
        }
    });
    if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = theme.pencil;
    }
    canvas.requestRenderAll();
}

function updateObjectColors(obj, theme) {
    const normStroke = normalizeColor(obj.stroke);
    const normFill = normalizeColor(obj.fill);

    const darkStroke = "#ffffff";
    const darkFill = "#4a90d9";
    const darkText = "#ffffff";
    const lightStroke = "#181828";
    const lightFill = "#2563eb";
    const lightText = "#181828";

    const isDefaultStroke = normStroke === darkStroke || normStroke === lightStroke;
    const isDefaultFill = normFill === darkFill || normFill === lightFill;
    const isDefaultText = normFill === darkText || normFill === lightText;
    const isStrokeColoredFill = normFill === darkStroke || normFill === lightStroke;

    if (obj.stroke && isDefaultStroke) obj.set({ stroke: theme.stroke });
    if (obj.fill && isDefaultFill) obj.set({ fill: theme.fill });
    if (obj.fill && isStrokeColoredFill && (obj.type === "path" || obj.type === "triangle")) {
        obj.set({ fill: theme.stroke });
    }
    if (obj.fill && isDefaultText && (obj.type === "i-text" || obj.type === "text")) {
        obj.set({ fill: theme.text });
    }
}