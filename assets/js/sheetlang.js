import { getCanvasBgColor } from "./editor.js";

const fabric = window.fabric;

function getThemeColors() {
  const style = getComputedStyle(document.body);
  return {
    stroke: style.getPropertyValue("--obj-stroke").trim() || "#ffffff",
    fill: style.getPropertyValue("--obj-fill").trim() || "#4a90d9",
    text: style.getPropertyValue("--obj-text").trim() || "#ffffff",
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function escapeText(t) {
  return String(t).replace(/[\r\n]+/g, " ");
}

/**
 * Парсит массив строк листа.
 * Индексы в G: считаются по номеру строки листа (1-based),
 * включая комментарии и пустые строки.
 * @param {string[]} rows — массив строк листа (row[0] каждой строки)
 */
export function parseLines(rows) {
  const objects = [];
  const rawGroups = [];
  const sheetRowToObjIdx = new Map();

  for (let i = 0; i < rows.length; i++) {
    const sheetRow = i + 1;
    const line = String(rows[i] ?? "").trim();
    if (!line || line.startsWith("#")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) continue;

    const type = line.substring(0, colonIdx);
    const params = line.substring(colonIdx + 1);

    if (type === "G") {
      const idxs = params
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isInteger(n) && n > 0);
      if (idxs.length) rawGroups.push(idxs);
      continue;
    }

    const p = params.split(",");
    try {
      const obj = buildObject(type, p);
      if (obj) {
        objects.push(obj);
        sheetRowToObjIdx.set(sheetRow, objects.length - 1);
      }
    } catch {
      // пропускаем битую строку
    }
  }

  const groups = rawGroups
      .map((g) => g.map((r) => sheetRowToObjIdx.get(r)).filter((i) => i !== undefined))
      .filter((g) => g.length > 0);

  return { objects, groups };
}

function buildObject(type, p) {
  switch (type) {
    case "R": {
      if (p.length < 7) return null;
      const [left, top, width, height] = p.slice(0, 4).map(num);
      if ([left, top, width, height].some((v) => v === null)) return null;
      return {
        kind: "rect",
        data: {
          left, top, width, height,
          fill: p[4], stroke: p[5],
          strokeWidth: num(p[6]) ?? 2,
        },
      };
    }
    case "D": {
      if (p.length < 7) return null;
      const [left, top, w, h] = p.slice(0, 4).map(num);
      if ([left, top, w, h].some((v) => v === null)) return null;
      const path = new fabric.Path(
          `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`,
          {
            fill: p[4], stroke: p[5],
            strokeWidth: num(p[6]) ?? 2,
            left, top,
            shapeType: "diamond",
          }
      );
      return { kind: "diamond", data: path };
    }
    case "C": {
      if (p.length < 7) return null;
      const [left, top, rx, ry] = p.slice(0, 4).map(num);
      if ([left, top, rx, ry].some((v) => v === null)) return null;
      return {
        kind: "circle",
        data: {
          left, top, rx, ry,
          fill: p[4], stroke: p[5],
          strokeWidth: num(p[6]) ?? 2,
          originX: "center", originY: "center",
        },
      };
    }
    case "L": {
      if (p.length < 6) return null;
      const [x1, y1, x2, y2] = p.slice(0, 4).map(num);
      if ([x1, y1, x2, y2].some((v) => v === null)) return null;
      return {
        kind: "line",
        data: { x1, y1, x2, y2, stroke: p[4], strokeWidth: num(p[5]) ?? 2 },
      };
    }
    case "A": {
      if (p.length < 6) return null;
      const [x1, y1, x2, y2] = p.slice(0, 4).map(num);
      if ([x1, y1, x2, y2].some((v) => v === null)) return null;
      return {
        kind: "arrow",
        data: { x1, y1, x2, y2, stroke: p[4], strokeWidth: num(p[5]) ?? 2 },
      };
    }
    case "T": {
      if (p.length < 5) return null;
      const [left, top, fontSize] = p.slice(0, 3).map(num);
      if ([left, top, fontSize].some((v) => v === null)) return null;
      return {
        kind: "text",
        data: {
          left, top, fontSize,
          color: p[3],
          text: p.slice(4).join(","),
        },
      };
    }
    default:
      return null;
  }
}

export function createFabricObject(obj) {
  switch (obj.kind) {
    case "rect": {
      const d = obj.data;
      return new fabric.Rect({ ...d, selectable: true });
    }
    case "diamond":
      return obj.data;
    case "circle": {
      const d = obj.data;
      return new fabric.Ellipse({ ...d, selectable: true });
    }
    case "line": {
      const d = obj.data;
      return new fabric.Line(
          [d.x1, d.y1, d.x2, d.y2],
          { stroke: d.stroke, strokeWidth: d.strokeWidth, selectable: true }
      );
    }
    case "arrow": {
      const d = obj.data;
      const angle = Math.atan2(d.y2 - d.y1, d.x2 - d.x1);
      const headLength = 14;
      const headAngle = Math.PI / 6;
      const hx = d.x2 - headLength * Math.cos(angle - headAngle);
      const hy = d.y2 - headLength * Math.sin(angle - headAngle);
      const line = new fabric.Line(
          [d.x1, d.y1,
            d.x2 - headLength * Math.cos(angle),
            d.y2 - headLength * Math.sin(angle)],
          { stroke: d.stroke, strokeWidth: d.strokeWidth, fill: "", selectable: true }
      );
      const head = new fabric.Path(
          `M ${d.x2} ${d.y2} L ${hx} ${hy} ` +
          `L ${d.x2 - headLength * Math.cos(angle + headAngle)} ` +
          `${d.y2 - headLength * Math.sin(angle + headAngle)} Z`,
          { fill: d.stroke, stroke: "none", selectable: true }
      );
      return new fabric.Group([line, head], { selectable: true });
    }
    case "text": {
      const d = obj.data;
      return new fabric.IText(d.text, {
        left: d.left, top: d.top, fontSize: d.fontSize, fill: d.color,
        selectable: true,
      });
    }
    default:
      return null;
  }
}

/**
 * @param {fabric.Canvas} canvas
 * @param {object[]} objects
 * @param {number[][]} groups — массивы 0-based индексов в objects
 */
export function renderOnCanvas(canvas, objects, groups) {
  canvas.clear();

  const created = objects.map(createFabricObject);
  const isGrouped = new Set();
  for (const g of groups) for (const i of g) isGrouped.add(i);

  for (let i = 0; i < created.length; i++) {
    if (!created[i]) continue;
    if (!isGrouped.has(i)) canvas.add(created[i]);
  }

  for (const groupIndices of groups) {
    const members = groupIndices.map((i) => created[i]).filter(Boolean);
    if (members.length >= 1) {
      const group = new fabric.Group(members, {});
      canvas.add(group);
    }
  }

  canvas.renderAll();
}

export function encodeCanvas(canvas) {
  const lines = [];
  const objectToLine = new Map();
  const objects = (canvas && canvas.getObjects ? canvas.getObjects() : (canvas.objects || []))
      .filter((obj) => obj && !obj.excludeFromExport && obj.type !== "image");

  for (const obj of objects) {
    if (obj.type === "group") continue;
    const line = encodeObject(obj);
    if (line) {
      objectToLine.set(obj, lines.length + 1);
      lines.push(line);
    }
  }

  for (const obj of objects) {
    if (obj.type !== "group") continue;
    if (isArrowGroup(obj)) {
      const line = encodeArrow(obj);
      if (line) lines.push(line);
      continue;
    }
    const members = getGroupMembers(obj);
    const memberLines = members.map((m) => objectToLine.get(m)).filter(Boolean);
    if (memberLines.length > 0) {
      lines.push("G:" + memberLines.join(","));
    }
  }

  return lines;
}

function getGroupMembers(group) {
  if (group.getObjects) return group.getObjects();
  return group.objects || group._objects || [];
}

function isArrowGroup(group) {
  const members = getGroupMembers(group);
  if (!members || members.length !== 2) return false;
  const types = members.map((o) => o.type).sort();
  return types[0] === "line" && types[1] === "path";
}

function encodeArrow(group) {
  const members = getGroupMembers(group);
  const lineObj = members.find((o) => o.type === "line");
  if (!lineObj) return null;
  const cx = group.left + group.width / 2;
  const cy = group.top + group.height / 2;
  const rad = (fabric.util && fabric.util.degreesToRadians)
      ? fabric.util.degreesToRadians(group.angle || 0)
      : ((group.angle || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = group.scaleX || 1;
  const sy = group.scaleY || 1;
  const rot = (lx, ly) => ({
    x: cx + cos * lx * sx - sin * ly * sy,
    y: cy + sin * lx * sx + cos * ly * sy,
  });
  const a = rot(lineObj.x1, lineObj.y1);
  const b = rot(lineObj.x2, lineObj.y2);
  return `A:${Math.round(a.x)},${Math.round(a.y)},${Math.round(b.x)},${Math.round(b.y)},${lineObj.stroke || "#ffffff"},${lineObj.strokeWidth || 2}`;
}

function encodeObject(obj) {
  const theme = getThemeColors();
  switch (obj.type) {
    case "rect":
      return `R:${Math.round(obj.left)},${Math.round(obj.top)},${Math.round(obj.width)},${Math.round(obj.height)},${obj.fill || theme.fill},${obj.stroke || theme.stroke},${obj.strokeWidth || 2}`;
    case "ellipse":
      return `C:${Math.round(obj.left)},${Math.round(obj.top)},${Math.round(obj.rx)},${Math.round(obj.ry)},${obj.fill || theme.fill},${obj.stroke || theme.stroke},${obj.strokeWidth || 2}`;
    case "line":
      return `L:${Math.round(obj.x1)},${Math.round(obj.y1)},${Math.round(obj.x2)},${Math.round(obj.y2)},${obj.stroke || theme.stroke},${obj.strokeWidth || 2}`;
    case "i-text":
    case "text":
      return `T:${Math.round(obj.left)},${Math.round(obj.top)},${obj.fontSize || 20},${obj.fill || theme.text},${escapeText(obj.text || "")}`;
    case "path":
      if (obj.shapeType === "diamond") {
        const w = Math.round(obj.width || 60);
        const h = Math.round(obj.height || 60);
        return `D:${Math.round(obj.left || 0)},${Math.round(obj.top || 0)},${w},${h},${obj.fill || theme.fill},${obj.stroke || theme.stroke},${obj.strokeWidth || 2}`;
      }
      return null;
    default:
      return null;
  }
}