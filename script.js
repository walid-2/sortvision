// Helper for async delays
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class AlgoVisualizer {
    constructor() {
        // Elements
        this.container = document.getElementById('visualizer-container');
        this.sizeSlider = document.getElementById('size-slider');
        this.speedSlider = document.getElementById('speed-slider');
        this.algoSelect = document.getElementById('algo-select');
        this.distroSelect = document.getElementById('distro-select');
        this.opsDisplay = document.getElementById('ops-display');
        this.timerDisplay = document.getElementById('timer-display');
        this.soundIcon = document.getElementById('sound-icon');

        // Modal Elements
        this.infoModal = document.getElementById('info-modal');
        this.btnStartApp = document.getElementById('start-app-btn');
        this.loadingOverlay = document.getElementById('loading-overlay');

        // Buttons
        this.btnGenerate = document.getElementById('generate-btn');
        this.btnRestart = document.getElementById('restart-btn');
        this.btnPause = document.getElementById('pause-btn');
        this.btnSort = document.getElementById('sort-btn');
        this.btnSound = document.getElementById('sound-btn');
        this.sizeVal = document.getElementById('size-val');
        this.speedVal = document.getElementById('speed-val');

        // State
        this.array = [];
        this.initialArray = [];
        this.isSorting = false;
        this.isPaused = false;
        this.abortSort = false;
        this.isMuted = true;
        this.operations = 0;

        // Audio
        this.audioCtx = null;

        // Timer
        this.startTime = 0;
        this.totalPausedTime = 0;
        this.pauseStartTime = 0;
        this.timerInterval = null;

        // Bind Events
        this.btnGenerate.onclick = () => this.generateNewArray();
        this.btnRestart.onclick = () => this.resetArray();
        this.btnSort.onclick = () => this.startSort();
        this.btnPause.onclick = () => this.togglePause();
        this.btnSound.onclick = () => this.toggleSound();
        this.btnStartApp.onclick = () => this.closeInfoModal();

        this.distroSelect.onchange = () => this.generateNewArray();
        this.sizeSlider.oninput = (e) => this.onSizeChange(e);
        this.speedSlider.oninput = (e) => this.onSpeedChange(e);

        // Initial setup
        this.generateNewArray();
        this.btnPause.classList.add('disabled-btn');
        
        // Startup sequence
        this.safeStartup();
    }

    async safeStartup() {
        // Simulate initialization delay
        await sleep(500);

        if (this.loadingOverlay) {
            this.loadingOverlay.style.opacity = '0';
            await sleep(500);
            this.loadingOverlay.remove();
        }

        if (this.infoModal) {
            this.infoModal.classList.remove('hidden');
            this.infoModal.style.display = 'flex';
        }
    }

    closeInfoModal() {
        if (this.infoModal) {
            this.infoModal.classList.add('hidden');
            this.infoModal.style.display = 'none';
        }
    }

    // --- Audio System ---

    initAudio() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    playNote(value) {
        if (this.isMuted || !this.audioCtx || this.isPaused) return;

        const oscillator = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();

        oscillator.type = 'sine';
        const frequency = 200 + (value * 6);
        oscillator.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

        gainNode.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);

        oscillator.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);

        oscillator.start();
        oscillator.stop(this.audioCtx.currentTime + 0.1);
    }

    playVictory() {
        if (!this.audioCtx || this.isMuted) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.frequency.setValueAtTime(200, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, this.audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.3);
    }

    // --- UI Helpers ---

    onSizeChange() {
        this.sizeVal.innerText = this.sizeSlider.value;
        if (this.isSorting) {
            this.abortSort = true;
        }
        this.generateNewArray();
    }

    onSpeedChange() {
        const val = parseInt(this.speedSlider.value);
        if (val < 30) this.speedVal.innerText = "Slow";
        else if (val < 70) this.speedVal.innerText = "Medium";
        else this.speedVal.innerText = "Fast";
    }

    toggleSound() {
        this.isMuted = !this.isMuted;
        if (!this.isMuted) this.initAudio();

        if (this.isMuted) {
            this.soundIcon.className = "fa-solid fa-volume-xmark";
            this.btnSound.classList.remove("text-emerald-400", "border-emerald-400");
            this.btnSound.classList.add("text-slate-400", "border-slate-600");
        } else {
            this.soundIcon.className = "fa-solid fa-volume-high";
            this.btnSound.classList.remove("text-slate-400", "border-slate-600");
            this.btnSound.classList.add("text-emerald-400", "border-emerald-400");
        }
    }

    togglePause() {
        if (!this.isSorting) return;
        this.isPaused = !this.isPaused;
        this.updatePauseBtn();

        if (this.isPaused) {
            this.pauseStartTime = Date.now();
            this.btnPause.title = "Continue visualization.";
        } else {
            this.totalPausedTime += (Date.now() - this.pauseStartTime);
            this.btnPause.title = "Pause visualization.";
        }
    }

    updatePauseBtn() {
        if (this.isPaused) {
            this.btnPause.innerHTML = '<i class="fa-solid fa-play"></i>';
            this.btnPause.classList.replace('bg-amber-600', 'bg-green-600');
            this.btnPause.classList.replace('hover:bg-amber-500', 'hover:bg-green-500');
        } else {
            this.btnPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
            this.btnPause.classList.replace('bg-green-600', 'bg-amber-600');
            this.btnPause.classList.replace('hover:bg-green-500', 'hover:bg-amber-500');
        }
    }

    toggleControls(enable) {
        this.sizeSlider.disabled = !enable;
        this.btnGenerate.disabled = !enable;
        this.algoSelect.disabled = !enable;
        this.distroSelect.disabled = !enable;

        const disabledTitle = "Controls disabled while sorting is active.";
        const pauseDisabledTitle = "Sorting not yet started or has finished.";

        if (enable) {
            this.btnPause.classList.add('disabled-btn');
            this.btnPause.title = pauseDisabledTitle;

            this.btnSort.innerHTML = '<i class="fa-solid fa-play"></i> <span class="hidden sm:inline">Start Sort</span>';
            this.btnSort.classList.remove('bg-slate-600', 'disabled-btn');
            this.btnSort.classList.add('bg-emerald-500', 'hover:bg-emerald-600');
            this.btnSort.title = "Start the selected sorting algorithm.";

            this.sizeSlider.classList.remove('opacity-50');
            this.btnGenerate.title = "Generate a new random array.";
            this.algoSelect.title = "";
            this.distroSelect.title = "";
        } else {
            this.btnPause.classList.remove('disabled-btn');
            this.btnPause.title = "Pause visualization.";

            this.btnSort.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span class="hidden sm:inline">Sorting...</span>';
            this.btnSort.classList.remove('bg-emerald-500', 'hover:bg-emerald-600');
            this.btnSort.classList.add('bg-slate-600', 'disabled-btn');
            this.btnSort.title = disabledTitle;

            this.sizeSlider.classList.add('opacity-50');
            this.btnGenerate.title = disabledTitle;
            this.algoSelect.title = disabledTitle;
            this.distroSelect.title = disabledTitle;
        }
    }

    // --- Array Logic ---

    generateArrayByDistro(size, distribution) {
        const MIN_VAL = 5;
        const MAX_VAL = 100;

        if (distribution === 'rev_sorted') {
            const arr = [];
            for (let i = MIN_VAL; i <= MAX_VAL; i++) arr.push(i);
            return arr.slice(0, size).reverse();
        } else if (distribution === 'few_unique') {
            const uniqueValues = Array.from({length: 5}, () => Math.floor(Math.random() * (MAX_VAL - MIN_VAL + 1)) + MIN_VAL);
            return Array.from({length: size}, () => uniqueValues[Math.floor(Math.random() * uniqueValues.length)]);
        } else {
            return Array.from({length: size}, () => Math.floor(Math.random() * (MAX_VAL - MIN_VAL + 1)) + MIN_VAL);
        }
    }

    generateNewArray() {
        if (this.isSorting) this.abortSort = true;

        const size = parseInt(this.sizeSlider.value);
        const distribution = this.distroSelect.value;

        this.array = this.generateArrayByDistro(size, distribution);
        this.initialArray = [...this.array];
        this.renderBars(this.array);
        this.resetStats();
    }

    resetArray() {
        if (this.isSorting) this.abortSort = true;
        this.array = [...this.initialArray];
        this.renderBars(this.array);
        this.resetStats();
    }

    renderBars(arr) {
        this.container.innerHTML = "";
        const isDense = arr.length > 60;

        arr.forEach(val => {
            const bar = document.createElement("div");
            bar.className = "array-bar";
            bar.style.height = `${val * 0.8}%`;
            bar.style.flexGrow = "1";
            bar.style.width = "auto";
            bar.style.margin = isDense ? "0 0.5px" : "0 1px";
            bar.title = val;
            this.container.appendChild(bar);
        });
    }

    resetStats() {
        this.operations = 0;
        this.opsDisplay.innerText = "0";
        this.timerDisplay.innerText = "0.00s";
        if (this.timerInterval) clearInterval(this.timerInterval);
    }

    startTimer() {
        this.startTime = Date.now();
        this.totalPausedTime = 0;
        
        this.timerInterval = setInterval(() => {
            if (this.isSorting && !this.abortSort && !this.isPaused) {
                const elapsed = (Date.now() - this.startTime - this.totalPausedTime) / 1000;
                this.timerDisplay.innerText = `${elapsed.toFixed(2)}s`;
            }
        }, 50);
    }

    getDelay() {
        const speed = parseInt(this.speedSlider.value);
        return (400 - (speed * 3.8));
    }

    async sleepStep() {
        // Handle Pause
        while (this.isPaused) {
            if (this.abortSort) return;
            await sleep(100);
        }
        if (this.abortSort) return;
        
        // Handle Speed
        await sleep(this.getDelay());
    }

    incrementOps() {
        this.operations++;
        this.opsDisplay.innerText = this.operations.toLocaleString();
    }

    markAllSorted(bars) {
        for (let i = 0; i < bars.length; i++) {
            bars[i].classList.remove('bar-compare', 'bar-swap', 'bar-overwrite', 'bar-pivot');
            bars[i].classList.add('bar-sorted');
        }
    }

    // --- Main Loop ---

    async startSort() {
        if (this.isSorting) return;
        if (!this.isMuted) this.initAudio();

        this.isSorting = true;
        this.abortSort = false;
        this.isPaused = false;
        this.updatePauseBtn();
        this.toggleControls(false);

        this.startTimer();

        const algo = this.algoSelect.value;
        const bars = document.getElementsByClassName('array-bar');

        try {
            if (algo === 'bubble') await this.bubbleSort(bars);
            else if (algo === 'selection') await this.selectionSort(bars);
            else if (algo === 'insertion') await this.insertionSort(bars);
            else if (algo === 'merge') await this.mergeSortWrapper(bars);
            else if (algo === 'quick') await this.quickSortWrapper(bars);

            if (!this.abortSort) {
                this.markAllSorted(bars);
                this.playVictory();
            }
        } catch (e) {
            console.error(e);
        } finally {
            this.isSorting = false;
            this.isPaused = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.toggleControls(true);
            this.updatePauseBtn();

            if (this.abortSort) {
                for (let i = 0; i < bars.length; i++) {
                    bars[i].style.backgroundColor = '#34d399'; // reset to Emerald
                    bars[i].classList.remove('bar-compare', 'bar-swap', 'bar-overwrite', 'bar-pivot', 'bar-sorted');
                }
            }
        }
    }

    // --- ALGORITHMS ---

    async bubbleSort(bars) {
        const n = this.array.length;
        for (let i = 0; i < n - 1; i++) {
            if (this.abortSort) return;
            for (let j = 0; j < n - i - 1; j++) {
                if (this.abortSort) return;
                
                bars[j].classList.add('bar-compare');
                bars[j + 1].classList.add('bar-compare');
                this.playNote(this.array[j]);
                this.incrementOps();
                await this.sleepStep();

                if (this.array[j] > this.array[j + 1]) {
                    bars[j].classList.remove('bar-compare');
                    bars[j + 1].classList.remove('bar-compare');
                    bars[j].classList.add('bar-swap');
                    bars[j + 1].classList.add('bar-swap');
                    
                    this.playNote(this.array[j + 1]);
                    this.incrementOps();
                    await this.sleepStep();

                    // Swap logic
                    [this.array[j], this.array[j + 1]] = [this.array[j + 1], this.array[j]];
                    bars[j].style.height = `${this.array[j] * 0.8}%`;
                    bars[j + 1].style.height = `${this.array[j + 1] * 0.8}%`;

                    await this.sleepStep();
                    bars[j].classList.remove('bar-swap');
                    bars[j + 1].classList.remove('bar-swap');
                } else {
                    bars[j].classList.remove('bar-compare');
                    bars[j + 1].classList.remove('bar-compare');
                }
            }
            bars[n - i - 1].classList.add('bar-sorted');
        }
        bars[0].classList.add('bar-sorted');
    }

    async selectionSort(bars) {
        const n = this.array.length;
        for (let i = 0; i < n; i++) {
            if (this.abortSort) return;
            let minIdx = i;
            bars[i].classList.add('bar-pivot');
            await this.sleepStep();

            for (let j = i + 1; j < n; j++) {
                if (this.abortSort) return;
                bars[j].classList.add('bar-compare');
                this.playNote(this.array[j]);
                this.incrementOps();
                await this.sleepStep();

                if (this.array[j] < this.array[minIdx]) {
                    if (minIdx !== i) bars[minIdx].classList.remove('bar-overwrite');
                    minIdx = j;
                    bars[minIdx].classList.add('bar-overwrite');
                }
                bars[j].classList.remove('bar-compare');
            }

            if (this.abortSort) return;

            if (minIdx !== i) {
                bars[i].classList.add('bar-swap');
                bars[minIdx].classList.remove('bar-overwrite');
                bars[minIdx].classList.add('bar-swap');
                this.incrementOps();
                await this.sleepStep();

                [this.array[i], this.array[minIdx]] = [this.array[minIdx], this.array[i]];
                bars[i].style.height = `${this.array[i] * 0.8}%`;
                bars[minIdx].style.height = `${this.array[minIdx] * 0.8}%`;

                await this.sleepStep();
                bars[i].classList.remove('bar-swap');
                bars[minIdx].classList.remove('bar-swap');
            } else {
                bars[minIdx].classList.remove('bar-overwrite');
            }

            bars[i].classList.remove('bar-pivot');
            bars[i].classList.add('bar-sorted');
            await this.sleepStep();
        }
    }

    async insertionSort(bars) {
        const n = this.array.length;
        for (let i = 1; i < n; i++) {
            if (this.abortSort) return;
            let key = this.array[i];
            bars[i].classList.add('bar-overwrite');
            await this.sleepStep();

            let j = i - 1;
            while (j >= 0) {
                if (this.abortSort) return;
                bars[j].classList.add('bar-compare');
                this.playNote(this.array[j]);
                this.incrementOps();
                await this.sleepStep();

                if (this.array[j] > key) {
                    bars[j + 1].classList.add('bar-swap');
                    bars[j].classList.add('bar-swap');
                    this.incrementOps();
                    await this.sleepStep();

                    this.array[j + 1] = this.array[j];
                    bars[j + 1].style.height = `${this.array[j + 1] * 0.8}%`;

                    bars[j + 1].classList.remove('bar-swap');
                    bars[j].classList.remove('bar-swap');
                    bars[j].classList.remove('bar-compare');
                    j--;
                } else {
                    bars[j].classList.remove('bar-compare');
                    break;
                }
            }

            this.array[j + 1] = key;
            bars[j + 1].style.height = `${this.array[j + 1] * 0.8}%`;
            bars[j + 1].classList.remove('bar-overwrite');
            bars[j + 1].classList.add('bar-sorted');
            await this.sleepStep();

            for (let k = 0; k <= i; k++) {
                if (k !== j + 1) bars[k].classList.remove('bar-compare');
            }
        }
        
        // Final pass to ensure all marked sorted (visual cleanup)
        for (let i = 0; i < n; i++) {
            bars[i].classList.add('bar-sorted');
            bars[i].classList.remove('bar-overwrite');
        }
    }

    async mergeSortWrapper(bars) {
        await this.mergeSort(0, this.array.length - 1, bars);
    }

    async mergeSort(start, end, bars) {
        if (start >= end || this.abortSort) return;
        const mid = Math.floor((start + end) / 2);
        await this.mergeSort(start, mid, bars);
        await this.mergeSort(mid + 1, end, bars);
        await this.merge(start, mid, end, bars);
    }

    async merge(start, mid, end, bars) {
        if (this.abortSort) return;
        
        // Create copies for reference
        const left = this.array.slice(start, mid + 1);
        const right = this.array.slice(mid + 1, end + 1);

        let i = 0, j = 0, k = start;

        while (i < left.length && j < right.length) {
            if (this.abortSort) return;
            bars[k].classList.add('bar-overwrite');
            this.playNote(this.array[k]);
            this.incrementOps();
            await this.sleepStep();

            if (left[i] <= right[j]) {
                this.array[k] = left[i];
                bars[k].style.height = `${this.array[k] * 0.8}%`;
                i++;
            } else {
                this.array[k] = right[j];
                bars[k].style.height = `${this.array[k] * 0.8}%`;
                j++;
            }

            this.incrementOps();
            await this.sleepStep();
            bars[k].classList.remove('bar-overwrite');
            bars[k].classList.add('bar-sorted');
            k++;
        }

        while (i < left.length) {
            if (this.abortSort) return;
            bars[k].classList.add('bar-overwrite');
            this.playNote(this.array[k]);
            this.incrementOps();
            await this.sleepStep();

            this.array[k] = left[i];
            bars[k].style.height = `${this.array[k] * 0.8}%`;

            await this.sleepStep();
            bars[k].classList.remove('bar-overwrite');
            bars[k].classList.add('bar-sorted');
            i++;
            k++;
        }

        while (j < right.length) {
            if (this.abortSort) return;
            bars[k].classList.add('bar-overwrite');
            this.playNote(this.array[k]);
            this.incrementOps();
            await this.sleepStep();

            this.array[k] = right[j];
            bars[k].style.height = `${this.array[k] * 0.8}%`;

            await this.sleepStep();
            bars[k].classList.remove('bar-overwrite');
            bars[k].classList.add('bar-sorted');
            j++;
            k++;
        }
    }

    async quickSortWrapper(bars) {
        await this.quickSort(0, this.array.length - 1, bars);
    }

    async quickSort(low, high, bars) {
        if (low < high) {
            if (this.abortSort) return;
            const pi = await this.partition(low, high, bars);
            await this.quickSort(low, pi - 1, bars);
            await this.quickSort(pi + 1, high, bars);
        } else if (low === high) {
            bars[low].classList.add('bar-sorted');
        }
    }

    async partition(low, high, bars) {
        if (this.abortSort) return 0;
        const pivot = this.array[high];
        bars[high].classList.add('bar-pivot');
        await this.sleepStep();

        let i = low - 1;

        for (let j = low; j < high; j++) {
            if (this.abortSort) return 0;
            bars[j].classList.add('bar-compare');
            this.playNote(this.array[j]);
            this.incrementOps();
            await this.sleepStep();

            if (this.array[j] <= pivot) {
                i++;
                bars[i].classList.add('bar-swap');
                bars[j].classList.add('bar-swap');
                this.incrementOps();
                await this.sleepStep();

                [this.array[i], this.array[j]] = [this.array[j], this.array[i]];
                bars[i].style.height = `${this.array[i] * 0.8}%`;
                bars[j].style.height = `${this.array[j] * 0.8}%`;

                await this.sleepStep();
                bars[i].classList.remove('bar-swap');
                bars[j].classList.remove('bar-swap');
            }
            bars[j].classList.remove('bar-compare');
        }

        if (this.abortSort) return 0;

        bars[i + 1].classList.add('bar-swap');
        bars[high].classList.add('bar-swap');
        this.incrementOps();
        await this.sleepStep();

        [this.array[i + 1], this.array[high]] = [this.array[high], this.array[i + 1]];
        bars[i + 1].style.height = `${this.array[i + 1] * 0.8}%`;
        bars[high].style.height = `${this.array[high] * 0.8}%`;

        await this.sleepStep();
        bars[i + 1].classList.remove('bar-swap');
        bars[high].classList.remove('bar-swap', 'bar-pivot');
        bars[i + 1].classList.add('bar-sorted');

        return i + 1;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AlgoVisualizer();
});