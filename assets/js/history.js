const MAX_SIZE = 50;

class History {
    constructor(canvas) {
        this.canvas = canvas;
        this.stack = [];
        this.currentIndex = -1;
        this.maxSize = MAX_SIZE;
        this._suspend = false;
        // первичный снапшот — чтобы можно было откатить первое действие
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
            const state = JSON.parse(this.stack[index]);
            this._suspend = true;
            this.canvas.loadFromJSON(state, () => {
                this.canvas.renderAll();
                this._suspend = false;
                document.dispatchEvent(new CustomEvent("canvas:refresh-selection"));
                resolve();
            });
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