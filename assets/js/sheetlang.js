import { getCanvasBgColor } from "./editor.js"; // eslint-disable-line no-unused-vars

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
 * Мировые координаты объекта: центр + масштаб + поворот (угол отбрасываем).
 * Работает и для top-level, и для членов групп — calcTransformMatrix()
 * в Fabric 5.x включает трансформы всех родителей.
 */
function worldTransform(obj) {
  const m = obj.calcTransformMatrix();
  const d = fabric.util.qrDecompose(m);
  return { matrix: m, cx: d.translateX, cy: d.translateY, sx: d.scaleX, sy: d.scaleY };
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
      // Явно фиксируем pathOffset и размеры, чтобы дальнейшие мутации
      // (move/scale) не приводили к рассинхрону с encodeObject.
      path.pathOffset = new fabric.Point(w / 2, h / 2);
      path.width = w;
      path.height = h;
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
  const groupLines = [];
  const objects = (canvas && canvas.getObjects ? canvas.getObjects() : (canvas.objects || []))
      .filter((obj) => obj && !obj.excludeFromExport && obj.type !== "image");

  function walk(obj) {
    if (!obj || obj.excludeFromExport) return;

    if (obj.type === "group") {
      if (isArrowGroup(obj)) {
        const line = encodeArrow(obj);
        if (line) lines.push(line);
        return;
      }
      // Обычная группа: рекурсивно кодируем членов как top-level (через
      // world-matrix), запоминаем их номера строк и в конце сделаем G:.
      const memberLines = [];
      const members = getGroupMembers(obj);
      for (const m of members) {
        const before = lines.length;
        walk(m);
        if (lines.length > before) {
          memberLines.push(before + 1); // 1-based
        }
      }
      if (memberLines.length > 0) {
        groupLines.push("G:" + memberLines.join(","));
      }
      return;
    }

    const line = encodeObject(obj);
    if (line) lines.push(line);
  }

  objects.forEach(walk);
  groupLines.forEach((g) => lines.push(g));
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

  // Мировые координаты концов линии внутри группы.
  const p = lineObj.calcLinePoints();
  const m = lineObj.calcTransformMatrix();
  const A = fabric.util.transformPoint(new fabric.Point(p.x1, p.y1), m);
  const B = fabric.util.transformPoint(new fabric.Point(p.x2, p.y2), m);

  return `A:${Math.round(A.x)},${Math.round(A.y)},${Math.round(B.x)},${Math.round(B.y)},${lineObj.stroke || "#ffffff"},${lineObj.strokeWidth || 2}`;
}

function encodeObject(obj) {
  const theme = getThemeColors();
  const { matrix: m, cx, cy, sx, sy } = worldTransform(obj);

  switch (obj.type) {
    case "rect": {
      const w = Math.round((obj.width || 0) * sx);
      const h = Math.round((obj.height || 0) * sy);
      const left = Math.round(cx - w / 2);
      const top = Math.round(cy - h / 2);
      return `R:${left},${top},${w},${h},${obj.fill || theme.fill},${obj.stroke || theme.stroke},${obj.strokeWidth || 2}`;
    }

    case "ellipse": {
      const rx = Math.round((obj.rx || 0) * sx);
      const ry = Math.round((obj.ry || 0) * sy);
      const left = Math.round(cx - rx);
      const top = Math.round(cy - ry);
      return `C:${left},${top},${rx},${ry},${obj.fill || theme.fill},${obj.stroke || theme.stroke},${obj.strokeWidth || 2}`;
    }

    case "line": {
      // Используем мировые концы, а не obj.x1/y1/x2/y2 — они не обновляются
      // при перемещении/повороте объекта.
      const p = obj.calcLinePoints();
      const A = fabric.util.transformPoint(new fabric.Point(p.x1, p.y1), m);
      const B = fabric.util.transformPoint(new fabric.Point(p.x2, p.y2), m);
      return `L:${Math.round(A.x)},${Math.round(A.y)},${Math.round(B.x)},${Math.round(B.y)},${obj.stroke || theme.stroke},${obj.strokeWidth || 2}`;
    }

    case "i-text":
    case "text": {
      const fs = Math.round((obj.fontSize || 20) * sy);
      const w = (obj.width || 0) * sx;
      const h = (obj.height || 0) * sy;
      const left = Math.round(cx - w / 2);
      const top = Math.round(cy - h / 2);
      return `T:${left},${top},${fs},${obj.fill || theme.text},${escapeText(obj.text || "")}`;
    }

    case "path": {
      if (obj.shapeType === "diamond") {
        const w = Math.round((obj.width || 60) * sx);
        const h = Math.round((obj.height || 60) * sy);
        const left = Math.round(cx - w / 2);
        const top = Math.round(cy - h / 2);
        return `D:${left},${top},${w},${h},${obj.fill || theme.fill},${obj.stroke || theme.stroke},${obj.strokeWidth || 2}`;
      }
      return null;
    }

    default:
      return null;
  }
}