export const GRID_SIZE = 20;

let canvas = null;
let currentTool = "select";
let gridEnabled = true;

let isDrawingLine = null; // {startX, startY, shape}
let drawStart = null;
let gridObject = null;

export function initEditor() {
    canvas = new fabric.Canvas("schema-canvas", {
        backgroundColor: "#1a1a2e",
        selection: true,
        preserveObjectStacking: true,
        width: 1000,
        height: 700,
        renderOnAddRemove: false,
    });

    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = "#ffffff";
    canvas.freeDrawingBrush.width = 2;

    applyGrid(true);
    bindCanvasEvents();
    return canvas;
}

export function getCanvas() {
    return canvas;
}

export function setCurrentTool(tool) {
    currentTool = tool;
    canvas.selection = tool === "select";
    canvas.isDrawingMode = tool === "pencil";
    canvas.skipTargetFind = tool !== "select" && tool !== "eraser";
    canvas.defaultCursor = tool === "select" ? "default" : "crosshair";
    canvas.discardActiveObject();
    canvas.renderAll();
}

export function getCurrentTool() {
    return currentTool;
}

function snap(value) {
    if (!gridEnabled) return value;
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function applyGrid(enable) {
    gridEnabled = enable;
    if (gridObject && !gridObject.isMoving) {
        canvas.remove(gridObject);
        gridObject = null;
    }
    if (enable) {
        drawGrid();
    } else {
        canvas.backgroundColor = "#1a1a2e";
        canvas.renderAll();
    }
}

export function toggleGrid() {
    applyGrid(!gridEnabled);
    return gridEnabled;
}

export function isGridEnabled() {
    return gridEnabled;
}

function drawGrid() {
    const container = document.getElementById("canvas-container");
    const width = canvas.getWidth();
    const height = canvas.getHeight();
    const canvasSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${GRID_SIZE}" height="${GRID_SIZE}">
            <defs>
                <pattern id="smallGrid" width="${GRID_SIZE}" height="${GRID_SIZE}" patternUnits="userSpaceOnUse">
                    <path d="M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}" fill="none" stroke="#26264a" stroke-width="1"/>
                </pattern>
            </defs>
            <rect width="${width}" height="${height}" fill="url(#smallGrid)"/>
        </svg>`;
    const img = new Image();
    const svgData = "data:image/svg+xml;base64," + btoa(canvasSvg);
    img.onload = () => {
        fabric.Image.fromURL(img.src, (grid) => {
            grid.set({
                left: 0,
                top: 0,
                originX: "left",
                originY: "top",
                selectable: false,
                evented: false,
                excludeFromExport: true,
                objectCaching: false,
            });
            grid.globalCompositeOperation = "source-over";
            canvas.backgroundColor = "#1a1a2e";
            canvas.sendToBack(grid);
            gridObject = grid;
            canvas.renderAll();
        });
    };
    img.src = svgData;
}

function bindCanvasEvents() {
    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);
    canvas.on("mouse:dblclick", onDoubleClick);
    canvas.on("object:moving", onObjectMoving);
    canvas.on("selection:created", () => document.dispatchEvent(new CustomEvent("selection:changed")));
    canvas.on("selection:updated", () => document.dispatchEvent(new CustomEvent("selection:changed")));
    canvas.on("selection:cleared", () => document.dispatchEvent(new CustomEvent("selection:changed")));
    canvas.on("object:added", markDirty);
    canvas.on("object:modified", markDirty);
    canvas.on("object:removed", markDirty);
}

export function markDirty() {
    document.dispatchEvent(new CustomEvent("canvas:dirty"));
}

function onMouseDown(opt) {
    const pointer = canvas.getPointer(opt.e);
    const x = snap(pointer.x);
    const y = snap(pointer.y);

    if (currentTool === "eraser") {
        const target = canvas.findTarget(opt.e, true);
        if (target) {
            canvas.remove(target);
        }
        return;
    }

    if (currentTool === "line" || currentTool === "arrow") {
        if (!isDrawingLine) {
            isDrawingLine = { startX: x, startY: y, tool: currentTool };
            return;
        }
    }

    if (["rectangle", "diamond", "circle", "line", "arrow"].includes(currentTool)) {
        drawStart = { x, y };
    }
}

function onMouseMove(opt) {
    const pointer = canvas.getPointer(opt.e);
    document.dispatchEvent(new CustomEvent("coords:update", {
        detail: { x: Math.round(pointer.x), y: Math.round(pointer.y) },
    }));

    if (isDrawingLine) {
        const x = snap(pointer.x);
        const y = snap(pointer.y);
        if (!isDrawingLine.shape) {
            const line = new fabric.Line([isDrawingLine.startX, isDrawingLine.startY, x, y], {
                stroke: "#ffffff",
                strokeWidth: 2,
                selectable: false,
                evented: false,
                originX: "center",
                originY: "center",
            });
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
    if (isDrawingLine && isDrawingLine.shape) {
        const shape = isDrawingLine.shape;
        delete shape.excludeFromExport;
        shape.set({
            selectable: true,
            evented: true,
            excludeFromExport: false,
        });
        if (isDrawingLine.tool === "arrow") {
            canvas.remove(shape);
            const line = createArrow(shape.x1, shape.y1, shape.x2, shape.y2);
            canvas.add(line);
        }
        isDrawingLine = null;
        markDirty();
        saveUndo();
        return;
    }

    if (drawStart && drawStart.shape) {
        const shape = drawStart.shape;
        if (shape.width <= GRID_SIZE / 2 && shape.height <= GRID_SIZE / 2) {
            canvas.remove(shape);
        }
        drawStart = null;
        markDirty();
        saveUndo();
    }
}

function onDoubleClick(opt) {
    const target = canvas.findTarget(opt.e);
    if (target && target.type === "i-text") {
        canvas.setActiveObject(target);
        target.enterEditing();
        target.selectAll();
    }
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

    switch (tool) {
        case "rectangle":
            return new fabric.Rect({
                left, top, width, height,
                fill: "#4a90d9", stroke: "#ffffff", strokeWidth: 2,
            });
        case "diamond": {
            const path = new fabric.Path(`
                M ${left + width / 2} ${top}
                L ${left + width} ${top + height / 2}
                L ${left + width / 2} ${top + height}
                L ${left} ${top + height / 2} Z
            `, {
                fill: "#4a90d9", stroke: "#ffffff", strokeWidth: 2,
                left: 0, top: 0,
            });
            path.set({ left, top });
            return path;
        }
        case "circle":
            return new fabric.Ellipse({
                left: left + width / 2,
                top: top + height / 2,
                rx: width / 2,
                ry: height / 2,
                fill: "#4a90d9", stroke: "#ffffff", strokeWidth: 2,
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
            ["M", left + width / 2, top],
            ["L", left + width, top + height / 2],
            ["L", left + width / 2, top + height],
            ["L", left, top + height / 2],
            ["Z"],
        ];
        shape.dirty = true;
        shape.set({ left, top });
        shape._calcBounds();
        shape.setCoords();
    } else if (tool === "circle") {
        shape.set({ rx: width / 2, ry: height / 2 });
        shape.setPositionByOrigin(new fabric.Point(left + width / 2, top + height / 2), "center", "center");
    }
}

function createArrow(x1, y1, x2, y2) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLength = 14;
    const headAngle = Math.PI / 6;
    const hx = x2 - headLength * Math.cos(angle - headAngle);
    const hy = y2 - headLength * Math.sin(angle - headAngle);
    const line = new fabric.Line([x1, y1, x2 - headLength * Math.cos(angle), y2 - headLength * Math.sin(angle)], {
        stroke: "#ffffff",
        strokeWidth: 2,
        fill: "",
        selectable: true,
    });
    const head = new fabric.Path(`
        M ${x2} ${y2}
        L ${hx} ${hy}
        L ${x2 - headLength * Math.cos(angle + headAngle)} ${y2 - headLength * Math.sin(angle + headAngle)}
        Z
    `, {
        fill: "#ffffff",
        stroke: "none",
        selectable: true,
    });
    return new fabric.Group([line, head], {
        selectable: true,
    });
}

export function addText(text) {
    const t = new fabric.IText(text || "Текст", {
        left: 100,
        top: 100,
        fontSize: 20,
        fill: "#ffffff",
    });
    canvas.add(t);
    canvas.setActiveObject(t);
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
    if (factor < 0.1 || factor > 10) return;
    canvas.setZoom(factor);
    updateZoomUI();
}

export function zoomIn() {
    setZoom(canvas.getZoom() + 0.1);
}

export function zoomOut() {
    setZoom(canvas.getZoom() - 0.1);
}

export function resetZoom() {
    setZoom(1);
}

export function updateZoomUI() {
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

export function getJSON() {
    return canvas.toJSON();
}
