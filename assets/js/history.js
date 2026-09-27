const MAX_SIZE = 50;

class History {
    constructor(canvas) {
        this.canvas = canvas;
        this.stack = [];
        this.currentIndex = -1;
        this.maxSize = MAX_SIZE;
        this._suspend = false;
        this.saveState();
    }

    saveState() {
        if (this._suspend) return;
        let state;
        try { state = JSON.stringify(this.canvas.toJSON()); }
        catch { return; }

        this.stack = this.stack.slice(0, this.currentIndex + 1);
        this.stack.push(state);
        if (this.stack.length > this.maxSize) this.stack.shift();
        this.currentIndex = this.stack.length - 1;
        this.updateUI();
    }

    canUndo() { return this.currentIndex > 0; }
    canRedo() { return this.currentIndex < this.stack.length - 1; }

    async undo() {
        if (!this.canUndo()) return false;
        this.currentIndex--;
        await this.loadState(this.currentIndex);
        this.updateUI();
        return true;
    }

    async redo() {
        if (!this.canRedo()) return false;
        this.currentIndex++;
        await this.loadState(this.currentIndex);
        this.updateUI();
        return true;
    }

    loadState(index) {
        return new Promise((resolve) => {
            let state;
            try {
                state = JSON.parse(this.stack[index]);
            } catch (e) {
                console.error("history: bad state", e);
                resolve();
                return;
            }
            this._suspend = true;
            const done = () => {
                // Явный сброс в любом случае, даже если что-то пойдёт не так.
                this._suspend = false;
                document.dispatchEvent(new CustomEvent("canvas:refresh-selection"));
                resolve();
            };
            try {
                this.canvas.loadFromJSON(state, () => {
                    try {
                        this.canvas.renderAll();
                    } finally {
                        done();
                    }
                });
            } catch (e) {
                console.error("history: loadFromJSON failed", e);
                done();
            }
        });
    }

    updateUI() {
        document.dispatchEvent(new CustomEvent("history:changed", {
            detail: { canUndo: this.canUndo(), canRedo: this.canRedo() },
        }));
    }

    clear() {
        this.stack = [];
        this.currentIndex = -1;
        this._suspend = false;
        this.saveState();
    }
}

export function createHistory(canvas) {
    return new History(canvas);
}