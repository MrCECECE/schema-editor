# SheetLang — Language Reference

Compact canvas description language. Each line = one object. Designed for storage in Google Sheets cells (one line per cell/row).

## Syntax

```
TYPE:param1,param2,param3,...
```

- Lines starting with `#` are comments and ignored
- Empty lines are ignored
- All coordinates are pixels relative to canvas origin (top-left)
- Colors are hex strings (e.g. `#4a90d9` or `#fff`); an empty field means "no fill/stroke"
- Unknown or malformed lines are skipped (the app reports how many rows were skipped)

### Optional metadata

At the end of a line you can add:

```
,@a<angle>      rotation in degrees, e.g. @a45
,@o<opacity>    opacity 0..1, e.g. @o0.5
```

The fields are optional and may appear in either order. They apply to `R`, `D`, `C`, `T`, `P`
(`@o` also applies to `L` and `A`). Rotation of `L`/`A` is already baked into their coordinates,
so `@a` is not used there. Old lines without metadata are still valid.

## Object Types

### Rectangle
```
R:x,y,width,height,fill,stroke,strokeWidth[,@a…][,@o…]
```
Example: `R:100,200,80,60,#4a90d9,#ffffff,2`
Rotated: `R:100,200,80,60,#4a90d9,#ffffff,2,@a30`

### Diamond
```
D:x,y,width,height,fill,stroke,strokeWidth[,@a…][,@o…]
```
Bounding box of the unrotated diamond. Example: `D:300,150,60,60,#4a90d9,#ffffff,2`

### Circle / Ellipse
```
C:cx,cy,rx,ry,fill,stroke,strokeWidth[,@a…][,@o…]
```
`cx,cy` is the **center** point (not the top-left corner). Example: `C:500,200,40,40,#e74c3c,#ffffff,2`

### Line
```
L:x1,y1,x2,y2,stroke,strokeWidth[,@o…]
```
Example: `L:100,100,300,250,#ffffff,2`

### Arrow
```
A:x1,y1,x2,y2,stroke,strokeWidth[,@o…]
```
`x2,y2` is the **tip of the arrowhead**, not the end of the shaft.
Example: `A:100,100,400,300,#ffffff,2`

### Text
```
T:x,y,fontSize,color,text[,@a…][,@o…]
```
`x,y` is the top-left anchor of the unrotated text box. Commas inside `text` are preserved;
trailing `@a…` / `@o…` fields are stripped as metadata.
Example: `T:150,400,24,#ffffff,Chapter 1`

### Free path (pencil)
```
P:x,y,scaleX,scaleY,fill,stroke,strokeWidth,pathData[,@a…][,@o…]
```
`pathData` is the Fabric.js path command list written with spaces instead of commas
(`M 10 20 L 30 40 Z`). `x,y` is the top-left of the scaled bounding box. Empty `fill`
is valid (pencil strokes usually have no fill).
Example: `P:100,100,1,1,,#ffffff,2,M 0 0 L 20 5 L 40 0`

### Group (reference lines)
```
G:line1,line2,line3,...
```
Line numbers are 1-based, referencing the position in the full sheet (including comment and empty lines are counted as rows). Groups can only reference non-group objects that appear before the G line.
Example: `G:1,2,3`

Groups are rendered at the position of their first member, so objects keep their z-order
relative to the group.

## Examples

Simple scene:
```
# Scene 1
R:100,200,80,60,#4a90d9,#ffffff,2
C:500,200,40,40,#e74c3c,#ffffff,2
T:150,400,24,#ffffff,Hello Lore!
```

With groups:
```
R:50,50,100,40,#4a90d9,#ffffff,2
C:200,80,30,30,#e74c3c,#ffffff,2
D:300,50,50,50,#4a90d9,#ffffff,2
G:1,2,3
```

With rotation, opacity and a pencil stroke:
```
R:50,50,100,40,#4a90d9,#ffffff,2,@a15
C:200,80,30,30,#e74c3c,#ffffff,2,@o0.5
P:100,100,1,1,,#ffffff,2,M 0 0 L 20 5 L 40 0
```
