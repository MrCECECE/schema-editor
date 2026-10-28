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
  if (v == null) return null;
  const raw = String(v).trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function round(v, digits = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

/**
 * В одной ячейке листа лежит один объект, поэтому реальные переводы строк
 * внутри текста кодируем как `\n`, а обратный слэш — как `\\`. Иначе
 * многострочный текст при Push превращается в одну строку (и ломает
 * «1 строка = 1 объект»). Старые строки без экранирования читаются как раньше.
 */
function escapeText(t) {
  return String(t)
      .replace(/\\/g, "\\\\")
      .replace(/\r\n?/g, "\n")
      .replace(/\n/g, "\\n");
}

function unescapeText(t) {
  return String(t).replace(/\\([\\n])/g, (_, ch) => (ch === "n" ? "\n" : "\\"));
}

function colorValue(value, fallback) {
  return typeof value === "string" ? value : fallback;
}

function strokeWidthValue(obj) {
  const sw = Number(obj.strokeWidth);
  return Number.isFinite(sw) ? sw : 2;
}

/**
 * Левый/верхний угол bbox для origin left/top.
 * Fabric считает центр объекта как left + (width + strokeWidth) / 2,
 * поэтому учитываем обводку — иначе повёрнутые объекты уезжают
 * на strokeWidth/2 при каждом Push→Pull.
 */
function bboxStart(center, size, strokeWidth) {
  return Math.round(center - (size + strokeWidth) / 2);
}

/**
 * Необязательные поля-метаданные в конце строки:
 *   @a<angle>   — поворот в градусах
 *   @o<opacity> — прозрачность 0..1
 * Так формат остаётся обратно совместимым: старые строки без них читаются
 * как раньше.
 */
function metaSuffix(obj, withAngle = true, angleOverride) {
  let suffix = "";
  const angle = Number(angleOverride ?? obj.angle);
  if (withAngle && Number.isFinite(angle) && Math.abs(angle) > 0.01) {
    suffix += ",@a" + round(angle, 1);
  }
  const opacity = Number(obj.opacity);
  if (Number.isFinite(opacity) && opacity < 0.999) {
    suffix += ",@o" + round(Math.max(0, Math.min(1, opacity)), 2);
  }
  return suffix;
}

function extractMeta(params) {
  let angle = 0;
  let opacity = null;
  while (params.length) {
    const last = String(params[params.length - 1]).trim();
    let m = last.match(/^@a(-?\d+(?:\.\d+)?)$/);
    if (m) {
      angle = Number(m[1]);
      params.pop();
      continue;
    }
    m = last.match(/^@o(\d+(?:\.\d+)?)$/);
    if (m) {
      opacity = Math.max(0, Math.min(1, Number(m[1])));
      params.pop();
      continue;
    }
    break;
  }
  return {angle, opacity};
}

function serializePath(path) {
  if (!Array.isArray(path) || path.length === 0) return "";
  return path.map((seg) => seg.map((v, i) => {
    if (i === 0) return String(v);
    return String(round(v, 2));
  }).join(" ")).join(" ");
}

/**
 * Мировые координаты объекта: центр + масштаб + поворот (угол отдельно).
 * Работает и для top-level, и для членов групп — calcTransformMatrix()
 * в Fabric 5.x включает трансформы всех родителей.
 */
function worldTransform(obj) {
  const m = obj.calcTransformMatrix();
  const d = fabric.util.qrDecompose(m);
  return {
    matrix: m,
    cx: d.translateX,
    cy: d.translateY,
    sx: d.scaleX,
    sy: d.scaleY,
    angle: d.angle,
  };
}

/**
 * Парсит массив строк листа.
 * Индексы в G: считаются по номеру строки листа (1-based),
 * включая комментарии и пустые строки.
 * @param {string[]} rows — массив строк листа (row[0] каждой строки)
 * @returns {{objects: object[], groups: number[][], errors: number[]}}
 */
export function parseLines(rows) {
  const objects = [];
  const rawGroups = [];
  const errors = [];
  const sheetRowToObjIdx = new Map();

  for (let i = 0; i < rows.length; i++) {
    const sheetRow = i + 1;
    const line = String(rows[i] ?? "").trim();
    if (!line || line.startsWith("#")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) {
      errors.push(sheetRow);
      continue;
    }

    const type = line.substring(0, colonIdx).trim();
    const params = line.substring(colonIdx + 1);
    const p = params.split(",");
    const meta = extractMeta(p);

    if (type === "G") {
      const idxs = p
          .map((s) => parseInt(String(s).trim(), 10))
          .filter((n) => Number.isInteger(n) && n > 0);
      if (idxs.length) rawGroups.push(idxs);
      else errors.push(sheetRow);
      continue;
    }

    try {
      const obj = buildObject(type, p);
      if (obj) {
        obj.angle = meta.angle;
        obj.opacity = meta.opacity;
        objects.push(obj);
        sheetRowToObjIdx.set(sheetRow, objects.length - 1);
      } else {
        errors.push(sheetRow);
      }
    } catch {
      // пропускаем битую строку, но сообщаем номер
      errors.push(sheetRow);
    }
  }

  const groups = rawGroups
      .map((g) => g.map((r) => sheetRowToObjIdx.get(r)).filter((i) => i !== undefined))
      .filter((g) => g.length > 0);

  return {objects, groups, errors};
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
      return {kind: "diamond", data: path};
    }
    case "C": {
      if (p.length < 7) return null;
      const [cx, cy, rx, ry] = p.slice(0, 4).map(num);
      if ([cx, cy, rx, ry].some((v) => v === null)) return null;
      return {
        kind: "circle",
        data: {
          left: cx, top: cy, rx, ry,
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
        data: {x1, y1, x2, y2, stroke: p[4], strokeWidth: num(p[5]) ?? 2},
      };
    }
    case "A": {
      if (p.length < 6) return null;
      const [x1, y1, x2, y2] = p.slice(0, 4).map(num);
      if ([x1, y1, x2, y2].some((v) => v === null)) return null;
      return {
        kind: "arrow",
        data: {x1, y1, x2, y2, stroke: p[4], strokeWidth: num(p[5]) ?? 2},
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
          text: unescapeText(p.slice(4).join(",")),
        },
      };
    }
    case "P": {
      // P:x,y,scaleX,scaleY,fill,stroke,strokeWidth,pathData
      if (p.length < 8) return null;
      const [left, top, scaleX, scaleY] = p.slice(0, 4).map(num);
      if ([left, top, scaleX, scaleY].some((v) => v === null)) return null;
      const d = p.slice(7).join(",").trim();
      if (!d) return null;
      return {
        kind: "path",
        data: {
          left, top, scaleX, scaleY,
          fill: p[4], stroke: p[5],
          strokeWidth: num(p[6]) ?? 2,
          d,
        },
      };
    }
    default:
      return null;
  }
}

export function createFabricObject(obj) {
  let created = null;

  switch (obj.kind) {
    case "rect": {
      const d = obj.data;
      created = new fabric.Rect({...d, selectable: true});
      break;
    }
    case "diamond":
      created = obj.data;
      break;
    case "circle": {
      const d = obj.data;
      created = new fabric.Ellipse({...d, selectable: true});
      break;
    }
    case "line": {
      const d = obj.data;
      created = new fabric.Line(
          [d.x1, d.y1, d.x2, d.y2],
          {stroke: d.stroke, strokeWidth: d.strokeWidth, selectable: true}
      );
      // Fabric считает центр линии с учётом strokeWidth, поэтому просто
      // передать x1/y1 недостаточно: отрисовка уедет на strokeWidth/2.
      created.setPositionByOrigin(
          new fabric.Point((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2),
          "center", "center"
      );
      break;
    }
    case "arrow": {
      const d = obj.data;
      const angle = Math.atan2(d.y2 - d.y1, d.x2 - d.x1);
      const headLength = 14;
      const headAngle = Math.PI / 6;
      const hx = d.x2 - headLength * Math.cos(angle - headAngle);
      const hy = d.y2 - headLength * Math.sin(angle - headAngle);
      const lineEndX = d.x2 - headLength * Math.cos(angle);
      const lineEndY = d.y2 - headLength * Math.sin(angle);
      const line = new fabric.Line(
          [d.x1, d.y1, lineEndX, lineEndY],
          {stroke: d.stroke, strokeWidth: d.strokeWidth, fill: "", selectable: true}
      );
      line.setPositionByOrigin(
          new fabric.Point((d.x1 + lineEndX) / 2, (d.y1 + lineEndY) / 2),
          "center", "center"
      );
      const head = new fabric.Path(
          `M ${d.x2} ${d.y2} L ${hx} ${hy} ` +
          `L ${d.x2 - headLength * Math.cos(angle + headAngle)} ` +
          `${d.y2 - headLength * Math.sin(angle + headAngle)} Z`,
          {fill: d.stroke, stroke: "none", selectable: true, shapeType: "arrowHead"}
      );
      created = new fabric.Group([line, head], {selectable: true});
      break;
    }
    case "text": {
      const d = obj.data;
      created = new fabric.IText(d.text, {
        left: d.left, top: d.top, fontSize: d.fontSize, fill: d.color,
        selectable: true,
        // SheetLang не умеет наклонный/неравномерный текст.
        lockUniScaling: true,
      });
      break;
    }
    case "path": {
      const d = obj.data;
      created = new fabric.Path(d.d, {
        left: d.left, top: d.top,
        scaleX: d.scaleX, scaleY: d.scaleY,
        fill: d.fill, stroke: d.stroke,
        strokeWidth: d.strokeWidth,
        selectable: true,
      });
      break;
    }
    default:
      return null;
  }

  if (!created) return null;
  if (obj.opacity != null) {
    created.set({opacity: Math.max(0, Math.min(1, obj.opacity))});
  }
  // Для линий/стрелок поворот уже запечён в координатах концов.
  if (obj.angle && obj.kind !== "line" && obj.kind !== "arrow") {
    created.rotate(obj.angle);
  }
  created.setCoords();
  return created;
}

export function renderOnCanvas(canvas, objects, groups) {
  canvas.clear();

  const created = objects.map((obj) => {
    try {
      return createFabricObject(obj);
    } catch (e) {
      console.warn("SheetLang: не удалось создать объект", obj, e);
      return null;
    }
  });
  const groupOf = new Map();
  groups.forEach((indices, gi) => {
    indices.forEach((i) => {
      if (created[i] && !groupOf.has(i)) groupOf.set(i, gi);
    });
  });

  const groupStart = new Map();
  groups.forEach((indices, gi) => {
    const valid = indices.filter((i) => created[i]);
    if (valid.length) groupStart.set(gi, Math.min(...valid));
  });

  const addedGroups = new Set();
  const used = new Set();

  for (let i = 0; i < created.length; i++) {
    const obj = created[i];
    if (!obj) continue;

    const gi = groupOf.get(i);
    if (gi === undefined) {
      canvas.add(obj);
      continue;
    }
    if (addedGroups.has(gi)) continue;
    if (groupStart.get(gi) !== i) continue;

    const members = groups[gi]
        .map((k) => created[k])
        .filter((m) => m && !used.has(m));
    if (!members.length) continue;
    members.forEach((m) => used.add(m));
    addedGroups.add(gi);
    try {
      canvas.add(new fabric.Group(members, {}));
    } catch (e) {
      // Если группу собрать не удалось, лучше показать объекты,
      // чем потерять их целиком.
      console.warn("SheetLang: не удалось собрать группу", e);
      members.forEach((m) => canvas.add(m));
    }
  }

  canvas.renderAll();
}

export function encodeCanvas(canvas) {
  const lines = [];
  const groupLines = [];
  const theme = getThemeColors();
  const objects = (canvas && canvas.getObjects ? canvas.getObjects() : (canvas.objects || []))
      .filter((obj) => obj && !obj.excludeFromExport && obj.type !== "image");

  function walk(obj) {
    if (!obj || obj.excludeFromExport) return;

    if (obj.type === "group") {
      if (isArrowGroup(obj)) {
        let line = null;
        try {
          line = encodeArrow(obj, theme);
        } catch (e) {
          console.warn("SheetLang: не удалось закодировать стрелку", e);
        }
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

    let line = null;
    try {
      line = encodeObject(obj, theme);
    } catch (e) {
      console.warn("SheetLang: не удалось закодировать объект", obj, e);
    }
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
  // Признак наконечника обязателен: иначе любая группа «линия + path»
  // (например, линия + ромб) молча превращалась бы в стрелку.
  return members.some((o) => o.type === "line") &&
      members.some((o) => o.type === "path" && o.shapeType === "arrowHead");
}

function arrowTip(head) {
  if (!head || !Array.isArray(head.path) || !head.path.length) return null;
  const cmd = head.path[0];
  if (!cmd || cmd[0] !== "M" || cmd.length < 3) return null;
  const off = head.pathOffset || {x: 0, y: 0};
  const local = new fabric.Point(Number(cmd[1]) - off.x, Number(cmd[2]) - off.y);
  if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) return null;
  return fabric.util.transformPoint(local, head.calcTransformMatrix());
}

function encodeArrow(group, theme) {
  const members = getGroupMembers(group);
  const lineObj = members.find((o) => o.type === "line");
  if (!lineObj) return null;

  // Мировые координаты концов линии внутри группы.
  const p = lineObj.calcLinePoints();
  const m = lineObj.calcTransformMatrix();
  const A = fabric.util.transformPoint(new fabric.Point(p.x1, p.y1), m);
  const B = fabric.util.transformPoint(new fabric.Point(p.x2, p.y2), m);

  // Линия заканчивается у основания наконечника, поэтому конец линии —
  // ещё не конец стрелки. Берём вершину наконечника из его path.
  const head = members.find((o) => o.type === "path" && o.shapeType === "arrowHead");
  const tip = arrowTip(head) || B;

  return `A:${Math.round(A.x)},${Math.round(A.y)},` +
      `${Math.round(tip.x)},${Math.round(tip.y)},` +
      `${colorValue(lineObj.stroke, theme.stroke)},${strokeWidthValue(lineObj)}` +
      metaSuffix(group, false);
}

function encodeObject(obj, theme) {
  const {cx, cy, sx, sy, angle} = worldTransform(obj);
  const meta = metaSuffix(obj, true, angle);

  switch (obj.type) {
    case "rect": {
      const w = Math.round(Math.abs(obj.width || 0) * sx);
      const h = Math.round(Math.abs(obj.height || 0) * sy);
      const sw = strokeWidthValue(obj);
      const left = bboxStart(cx, w, sw);
      const top = bboxStart(cy, h, sw);
      return `R:${left},${top},${w},${h},` +
          `${colorValue(obj.fill, theme.fill)},${colorValue(obj.stroke, theme.stroke)},` +
          `${sw}${meta}`;
    }

    case "ellipse": {
      const rx = Math.round(Math.abs(obj.rx || 0) * sx);
      const ry = Math.round(Math.abs(obj.ry || 0) * sy);
      // C:x,y — центр (см. data/sheetlang-spec.md), а не левый верхний угол.
      return `C:${Math.round(cx)},${Math.round(cy)},${rx},${ry},` +
          `${colorValue(obj.fill, theme.fill)},${colorValue(obj.stroke, theme.stroke)},` +
          `${strokeWidthValue(obj)}${meta}`;
    }

    case "line": {
      // Используем мировые концы, а не obj.x1/y1/x2/y2 — они не обновляются
      // при перемещении/повороте объекта.
      const p = obj.calcLinePoints();
      const m = obj.calcTransformMatrix();
      const pA = fabric.util.transformPoint(new fabric.Point(p.x1, p.y1), m);
      const pB = fabric.util.transformPoint(new fabric.Point(p.x2, p.y2), m);
      return `L:${Math.round(pA.x)},${Math.round(pA.y)},` +
          `${Math.round(pB.x)},${Math.round(pB.y)},` +
          `${colorValue(obj.stroke, theme.stroke)},${strokeWidthValue(obj)}` +
          metaSuffix(obj, false);
    }

    case "i-text":
    case "text": {
      const fs = Math.round((obj.fontSize || 20) * sy);
      const w = Math.abs(obj.width || 0) * sx;
      const h = Math.abs(obj.height || 0) * sy;
      const sw = strokeWidthValue(obj);
      const left = bboxStart(cx, w, sw);
      const top = bboxStart(cy, h, sw);
      return `T:${left},${top},${fs},${colorValue(obj.fill, theme.text)},` +
          `${escapeText(obj.text || "")}${meta}`;
    }

    case "path": {
      if (obj.shapeType === "diamond") {
        const w = Math.round(Math.abs(obj.width || 60) * sx);
        const h = Math.round(Math.abs(obj.height || 60) * sy);
        const sw = strokeWidthValue(obj);
        const left = bboxStart(cx, w, sw);
        const top = bboxStart(cy, h, sw);
        return `D:${left},${top},${w},${h},` +
            `${colorValue(obj.fill, theme.fill)},${colorValue(obj.stroke, theme.stroke)},` +
            `${sw}${meta}`;
      }
      if (obj.shapeType === "arrowHead") return null;

      // Карандаш и прочие свободные path.
      const d = serializePath(obj.path);
      if (!d) return null;
      if (d.length > 45000) {
        console.warn("SheetLang: path слишком длинный, строка пропущена");
        return null;
      }
      const w = Math.abs(obj.width || 0) * sx;
      const h = Math.abs(obj.height || 0) * sy;
      const sw = strokeWidthValue(obj);
      const left = bboxStart(cx, w, sw);
      const top = bboxStart(cy, h, sw);
      return `P:${left},${top},${round(sx, 3)},${round(sy, 3)},` +
          `${colorValue(obj.fill, "")},${colorValue(obj.stroke, theme.stroke)},` +
          `${sw},${d}` +
          metaSuffix(obj, true, angle);
    }

    default:
      return null;
  }
}
