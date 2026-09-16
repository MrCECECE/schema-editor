# SheetLang — Language Reference

Compact canvas description language. Each line = one object. Designed for storage in Google Sheets cells (one line per cell/row).

## Syntax

```
TYPE:param1,param2,param3,...
```

- Lines starting with `#` are comments and ignored
- Empty lines are ignored
- All coordinates are pixels relative to canvas origin (top-left)
- Colors are hex strings (e.g. `#4a90d9` or `#fff`)
- Text values must not contain commas

## Object Types

### Rectangle
```
R:x,y,width,height,fill,stroke,strokeWidth
```
Example: `R:100,200,80,60,#4a90d9,#ffffff,2`

### Diamond
```
D:x,y,width,height,fill,stroke,strokeWidth
```
Bounding box coordinates. Example: `D:300,150,60,60,#4a90d9,#ffffff,2`

### Circle / Ellipse
```
C:x,y,rx,ry,fill,stroke,strokeWidth
```
`x,y` is the center point. Example: `C:500,200,40,40,#e74c3c,#ffffff,2`

### Line
```
L:x1,y1,x2,y2,stroke,strokeWidth
```
Example: `L:100,100,300,250,#ffffff,2`

### Arrow
```
A:x1,y1,x2,y2,stroke,strokeWidth
```
Example: `A:100,100,400,300,#ffffff,2`

### Text
```
T:x,y,fontSize,color,text
```
`x,y` is the top-left anchor. Text must not contain commas.
Example: `T:150,400,24,#ffffff,Chapter 1`

### Group (reference lines)
```
G:line1,line2,line3,...
```
Line numbers are 1-based, referencing the position in the full sheet (including comment and empty lines are counted as rows). Groups can only reference non-group objects that appear before the G line.
Example: `G:1,2,3`

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
