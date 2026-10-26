/**
 * Патчи Fabric.js 5.x, нужные и редактору, и вьюверу.
 * Держим в одном месте, чтобы версии не разъезжались.
 */

export function installFabricFixes() {
    if (typeof fabric === "undefined") return;

    // Fabric 5.3.0: "alphabetical" — не валидный CanvasTextBaseline.
    if (fabric.Text && fabric.Text.prototype._setTextStyles) {
        fabric.Text.prototype._setTextStyles = function (ctx, charStyle, forMeasuring) {
            ctx.textBaseline = "alphabetic";
            if (this.path) {
                switch (this.pathAlign) {
                    case "center":
                        ctx.textBaseline = "middle";
                        break;
                    case "ascender":
                        ctx.textBaseline = "top";
                        break;
                    case "descender":
                        ctx.textBaseline = "bottom";
                        break;
                }
            }
            ctx.font = this._getFontDeclaration(charStyle, forMeasuring);
        };
    }

    // shapeType (ромб / наконечник стрелки) — наш собственный признак.
    // Fabric 5.x НЕ сериализует stateProperties: toObject() собирает только
    // известные поля + propertiesToInclude. Поэтому без этого патча
    // canvas.toJSON() (undo/redo) теряет shapeType, и ромб перестаёт
    // кодироваться в SheetLang.
    if (fabric.Path && fabric.Path.prototype.toObject &&
        !fabric.Path.prototype._schemaShapeTypePatch) {
        const baseToObject = fabric.Path.prototype.toObject;
        fabric.Path.prototype.toObject = function (propertiesToInclude) {
            const data = baseToObject.call(this, propertiesToInclude);
            if (this.shapeType) data.shapeType = this.shapeType;
            return data;
        };
        fabric.Path.prototype._schemaShapeTypePatch = true;
    }
}
