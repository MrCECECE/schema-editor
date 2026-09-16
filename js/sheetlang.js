export function parseLines(lines) {
  const objects = [];
  const groups = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = String(raw).trim();
    if (!line || line.startsWith("#")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) continue;

    const type = line.substring(0, colonIdx);
    const params = line.substring(colonIdx + 1);

    if (type === "G") {
      const indices = params
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);
      if (indices.length > 0) groups.push(indices);
      continue;
    }

    const p = params.split(",");
    try {
      switch (type) {
        case "R": {
          if (p.length < 7) continue;
          objects.push({
            kind: "rect",
            data: {
              left: +p[0], top: +p[1], width: +p[2], height: +p[3],
              fill: p[4], stroke: p[5], strokeWidth: +p[6],
            },
          });
          break;
        }
        case "D": {
          if (p.length < 7) continue;
          const left = +p[0];
          const top = +p[1];
          const w = +p[2];
          const h = +p[3];
          const path = new fabric.Path(
            `M ${left + w / 2} ${top} L ${left + w} ${top + h / 2} L ${left + w / 2} ${top + h} L ${left} ${top + h / 2} Z`,
            { fill: p[4], stroke: p[5], strokeWidth: +p[6], left, top }
          );
          objects.push({ kind: "diamond", data: path });
          break;
        }
        case "C": {
          if (p.length < 7) continue;
          objects.push({
            kind: "circle",
            data: {
              left: +p[0], top: +p[1],
              rx: +p[2], ry: +p[3],
              fill: p[4], stroke: p[5], strokeWidth: +p[6],
              originX: "center", originY: "center",
            },
          });
          break;
        }
        case "L": {
          if (p.length < 6) continue;
          objects.push({
            kind: "line",
            data: {
              x1: +p[0], y1: +p[1], x2: +p[2], y2: +p[3],
              stroke: p[4], strokeWidth: +p[5],
            },
          });
          break;
        }
        case "A": {
          if (p.length < 6) continue;
          objects.push({
            kind: "arrow",
            data: {
              x1: +p[0], y1: +p[1], x2: +p[2], y2: +p[3],
              stroke: p[4], strokeWidth: +p[5],
            },
          });
          break;
        }
        case "T": {
          if (p.length < 5) continue;
          objects.push({
            kind: "text",
            data: {
              left: +p[0], top: +p[1], fontSize: +p[2], color: p[3],
              text: p.slice(4).join(","),
            },
          });
          break;
        }
        default:
          continue;
      }
    } catch {
      continue;
    }
  }

  return { objects, groups };
}

export function createFabricObject(obj) {
  switch (obj.kind) {
    case "rect": {
      const d = obj.data;
      return new fabric.Rect({
        left: d.left, top: d.top, width: d.width, height: d.height,
        fill: d.fill, stroke: d.stroke, strokeWidth: d.strokeWidth,
        selectable: true,
      });
    }
    case "diamond":
      return obj.data;
    case "circle": {
      const d = obj.data;
      return new fabric.Ellipse({
        left: d.left, top: d.top, rx: d.rx, ry: d.ry,
        fill: d.fill, stroke: d.stroke, strokeWidth: d.strokeWidth,
        originX: d.originX, originY: d.originY,
        selectable: true,
      });
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
        [d.x1, d.y1, d.x2 - headLength * Math.cos(angle), d.y2 - headLength * Math.sin(angle)],
        { stroke: d.stroke, strokeWidth: d.strokeWidth, fill: "", selectable: true }
      );
      const head = new fabric.Path(
        `M ${d.x2} ${d.y2} L ${hx} ${hy} L ${d.x2 - headLength * Math.cos(angle + headAngle)} ${d.y2 - headLength * Math.sin(angle + headAngle)} Z`,
        { fill: "#ffffff", stroke: "none", selectable: true }
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
  const grid = canvas.gridObject || null;
  canvas.clear();
  canvas.backgroundColor = "#1a1a2e";

  const created = [];
  const isGrouped = new Set();

  for (const group of groups) {
    for (const idx of group) {
      isGrouped.add(idx - 1);
    }
  }

  for (let i = 0; i < objects.length; i++) {
    created.push(createFabricObject(objects[i]));
  }

  for (let i = 0; i < created.length; i++) {
    if (!isGrouped.has(i)) {
      canvas.add(created[i]);
    }
  }

  for (const groupIndices of groups) {
    const members = groupIndices
      .map((idx) => created[idx - 1])
      .filter(Boolean);
    if (members.length >= 1) {
      const group = new fabric.Group(members, {});
      canvas.add(group);
    }
  }

  if (grid) {
    canvas.add(grid);
    canvas.sendToBack(grid);
    canvas.gridObject = grid;
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
      if (line) {
        lines.push(line);
      }
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
  const types = members.map(o => o.type).sort();
  return types[0] === "line" && types[1] === "path";
}

function encodeArrow(group) {
  const members = getGroupMembers(group);
  const lineObj = members.find(o => o.type === "line");
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
  switch (obj.type) {
    case "rect":
      return `R:${Math.round(obj.left)},${Math.round(obj.top)},${Math.round(obj.width)},${Math.round(obj.height)},${obj.fill || "#4a90d9"},${obj.stroke || "#ffffff"},${obj.strokeWidth || 2}`;
    case "ellipse":
      return `C:${Math.round(obj.left)},${Math.round(obj.top)},${Math.round(obj.rx)},${Math.round(obj.ry)},${obj.fill || "#4a90d9"},${obj.stroke || "#ffffff"},${obj.strokeWidth || 2}`;
    case "line":
      return `L:${Math.round(obj.x1)},${Math.round(obj.y1)},${Math.round(obj.x2)},${Math.round(obj.y2)},${obj.stroke || "#ffffff"},${obj.strokeWidth || 2}`;
    case "i-text":
    case "text":
      return `T:${Math.round(obj.left)},${Math.round(obj.top)},${obj.fontSize || 20},${obj.fill || "#ffffff"},${obj.text || ""}`;
    case "path":
      if (obj.shapeType === "diamond") {
        const w = Math.round(obj.width || 60);
        const h = Math.round(obj.height || 60);
        return `D:${Math.round(obj.left || 0)},${Math.round(obj.top || 0)},${w},${h},${obj.fill || "#4a90d9"},${obj.stroke || "#ffffff"},${obj.strokeWidth || 2}`;
      }
      return null;
    default:
      return null;
  }
}
