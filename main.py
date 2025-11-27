import asyncio
import random
import time
from pyscript import document, display  # noqa
from pyodide.ffi import create_proxy  # noqa
import js  # noqa


class AlgoVisualizer:
    def __init__(self):
        # Elements
        self.container = document.getElementById('visualizer-container')
        self.size_slider = document.getElementById('size-slider')
        self.speed_slider = document.getElementById('speed-slider')
        self.algo_select = document.getElementById('algo-select')
        self.distro_select = document.getElementById('distro-select')
        self.ops_display = document.getElementById('ops-display')
        self.timer_display = document.getElementById('timer-display')
        self.sound_icon = document.getElementById('sound-icon')

        # Modal Elements
        self.info_modal = document.getElementById('info-modal')
        self.btn_start_app = document.getElementById('start-app-btn')

        # Buttons
        self.btn_generate = document.getElementById('generate-btn')
        self.btn_restart = document.getElementById('restart-btn')
        self.btn_pause = document.getElementById('pause-btn')
        self.btn_sort = document.getElementById('sort-btn')
        self.btn_sound = document.getElementById('sound-btn')
        self.size_val = document.getElementById('size-val')
        self.speed_val = document.getElementById('speed-val')

        # State
        self.array = []
        self.initial_array = []
        self.is_sorting = False
        self.is_paused = False
        self.abort_sort = False
        self.is_muted = True
        self.operations = 0

        # Audio
        self.audio_ctx = None

        # Timer
        self.start_time = 0
        self.total_paused_time = 0
        self.pause_start_time = 0
        self.timer_task = None

        # Bind Events
        self.btn_generate.onclick = self.generate_new_array
        self.btn_restart.onclick = self.reset_array
        self.btn_sort.onclick = self.start_sort
        self.btn_pause.onclick = self.toggle_pause
        self.btn_sound.onclick = self.toggle_sound

        # Bind Modal Events
        if self.btn_start_app:
            self.btn_start_app.onclick = self.close_info_modal

        # Bind distribution change
        self.on_distro_change_proxy = create_proxy(self.generate_new_array)
        self.distro_select.addEventListener('change', self.on_distro_change_proxy)

        # Proxy for sliders (inputs need proxy to prevent garbage collection)
        self.on_size_change_proxy = create_proxy(self.on_size_change)
        self.size_slider.addEventListener('input', self.on_size_change_proxy)

        self.on_speed_change_proxy = create_proxy(self.on_speed_change)
        self.speed_slider.addEventListener('input', self.on_speed_change_proxy)

        # Init
        self.generate_new_array(None)

        # Ensure pause button is disabled initially
        self.btn_pause.classList.add('disabled-btn')

        # Trigger safe startup sequence
        asyncio.create_task(self.safe_startup())

    async def safe_startup(self):
        # Use a minimal sleep to yield control to the event loop, ensuring PyScript
        # and DOM bindings are fully active before removing the loader.
        # This prevents the modal being visible before the click handler is bound.
        await asyncio.sleep(0.1)

        # 1. REMOVE LOADING SCREEN
        loader = document.getElementById('loading-overlay')
        if loader:
            # Gentle fade out
            loader.style.opacity = '0'
            await asyncio.sleep(0.2)
            loader.remove()

        # 2. SHOW INFO MODAL with robust check, now that Python is ready to handle the click
        if self.info_modal:
            self.info_modal.classList.remove('hidden')
            self.info_modal.style.display = 'flex'  # Force flex for centering

    def close_info_modal(self, event):
        if self.info_modal:
            self.info_modal.classList.add('hidden')
            self.info_modal.style.display = 'none'

    def init_audio(self):
        if not self.audio_ctx:
            self.audio_ctx = js.window.AudioContext.new()

    def play_note(self, value):
        if self.is_muted or not self.audio_ctx or self.is_paused:
            return
        if self.audio_ctx.state == 'suspended':
            self.audio_ctx.resume()

        oscillator = self.audio_ctx.createOscillator()
        gain_node = self.audio_ctx.createGain()

        oscillator.type = 'sine'
        frequency = 200 + (value * 6)
        oscillator.frequency.setValueAtTime(frequency, self.audio_ctx.currentTime)

        gain_node.gain.setValueAtTime(0.2, self.audio_ctx.currentTime)
        gain_node.gain.linearRampToValueAtTime(0.05, self.audio_ctx.currentTime + 0.2)

        oscillator.connect(gain_node)
        gain_node.connect(self.audio_ctx.destination)

        oscillator.start()
        oscillator.stop(self.audio_ctx.currentTime + 0.1)

    def play_victory(self):
        if not self.audio_ctx or self.is_muted: return
        osc = self.audio_ctx.createOscillator()
        gain = self.audio_ctx.createGain()
        osc.connect(gain)
        gain.connect(self.audio_ctx.destination)
        osc.frequency.setValueAtTime(200, self.audio_ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(800, self.audio_ctx.currentTime + 0.3)
        gain.gain.setValueAtTime(0.1, self.audio_ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0, self.audio_ctx.currentTime + 0.3)
        osc.start()
        osc.stop(self.audio_ctx.currentTime + 0.3)

    #
    # --- UI Helpers ---
    #

    def on_size_change(self, event):
        self.size_val.innerText = self.size_slider.value
        if self.is_sorting:
            self.abort_sort = True
        self.generate_new_array(None)

    def on_speed_change(self, event):
        val = int(self.speed_slider.value)
        if val < 30:
            self.speed_val.innerText = "Slow"
        elif val < 70:
            self.speed_val.innerText = "Medium"
        else:
            self.speed_val.innerText = "Fast"

    def toggle_sound(self, event):
        self.is_muted = not self.is_muted
        if not self.is_muted:
            self.init_audio()

        if self.is_muted:
            self.sound_icon.className = "fa-solid fa-volume-xmark"
            self.btn_sound.classList.remove("text-sky-400", "border-sky-400")
            self.btn_sound.classList.add("text-slate-400", "border-slate-600")
        else:
            self.sound_icon.className = "fa-solid fa-volume-high"
            self.btn_sound.classList.remove("text-slate-400", "border-slate-600")
            self.btn_sound.classList.add("text-sky-400", "border-sky-400")

    def toggle_pause(self, event):
        if not self.is_sorting: return
        self.is_paused = not self.is_paused
        self.update_pause_btn()

        if self.is_paused:
            self.pause_start_time = time.time()
            self.btn_pause.title = "Continue visualization."
        else:
            self.total_paused_time += (time.time() - self.pause_start_time)
            self.btn_pause.title = "Pause visualization."

    def update_pause_btn(self):
        if self.is_paused:
            self.btn_pause.innerHTML = '<i class="fa-solid fa-play"></i>'
            self.btn_pause.classList.replace('bg-amber-600', 'bg-green-600')
            self.btn_pause.classList.replace('hover:bg-amber-500', 'hover:bg-green-500')
        else:
            self.btn_pause.innerHTML = '<i class="fa-solid fa-pause"></i>'
            self.btn_pause.classList.replace('bg-green-600', 'bg-amber-600')
            self.btn_pause.classList.replace('hover:bg-green-500', 'hover:bg-amber-500')

    def toggle_controls(self, enable):

        self.size_slider.disabled = not enable
        self.btn_generate.disabled = not enable
        self.algo_select.disabled = not enable
        self.distro_select.disabled = not enable

        disabled_title = "Controls disabled while sorting is active."
        pause_disabled_title = "Sorting not yet started or has finished."

        if enable:
            self.btn_pause.classList.add('disabled-btn')
            self.btn_pause.title = pause_disabled_title

            self.btn_sort.innerHTML = '<i class="fa-solid fa-play"></i> <span class="hidden sm:inline">Start Sort</span>'
            self.btn_sort.classList.remove('bg-slate-600', 'disabled-btn')
            self.btn_sort.classList.add('bg-sky-500', 'hover:bg-sky-600')
            self.btn_sort.title = "Start the selected sorting algorithm."

            self.size_slider.classList.remove('opacity-50')

            self.btn_generate.title = "Generate a new random array."
            self.algo_select.title = ""
            self.distro_select.title = ""
        else:
            self.btn_pause.classList.remove('disabled-btn')
            self.btn_pause.title = "Pause visualization."

            self.btn_sort.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span class="hidden sm:inline">Sorting...</span>'
            self.btn_sort.classList.remove('bg-sky-500', 'hover:bg-sky-600')
            self.btn_sort.classList.add('bg-slate-600', 'disabled-btn')
            self.btn_sort.title = disabled_title

            self.size_slider.classList.add('opacity-50')

            self.btn_generate.title = disabled_title
            self.algo_select.title = disabled_title
            self.distro_select.title = disabled_title

    #
    # --- Logic ---
    #

    def generate_array_by_distro(self, size, distribution):
        MIN_VAL = 5
        MAX_VAL = 100

        if distribution == 'rev_sorted':
            arr = list(range(MIN_VAL, MAX_VAL + 1))
            return arr[:size][::-1]
        elif distribution == 'few_unique':
            unique_values = [random.randint(MIN_VAL, MAX_VAL) for _ in range(5)]
            return [random.choice(unique_values) for _ in range(size)]
        else:
            return [random.randint(MIN_VAL, MAX_VAL) for _ in range(size)]

    def generate_new_array(self, event):
        if self.is_sorting: self.abort_sort = True

        size = int(self.size_slider.value)
        distribution = self.distro_select.value

        self.array = self.generate_array_by_distro(size, distribution)
        self.initial_array = self.array.copy()
        self.render_bars(self.array)
        self.reset_stats()

    def reset_array(self, event):
        if self.is_sorting: self.abort_sort = True
        self.array = self.initial_array.copy()
        self.render_bars(self.array)
        self.reset_stats()

    def render_bars(self, arr):
        self.container.innerHTML = ""

        # Responsive Logic: Use flex-grow instead of calculating pixel width in Python
        # This ensures bars always fit the container regardless of screen size

        is_dense = len(arr) > 60

        for val in arr:
            bar = document.createElement("div")
            bar.classList.add("array-bar")

            # Height is percentage based on value
            bar.style.height = f"{val * 0.8}%"

            # Width fills available space equally
            bar.style.flexGrow = "1"
            bar.style.width = "auto"

            # Dynamic margins based on density to prevent overflow on mobile
            if is_dense:
                bar.style.margin = "0 0.5px"
            else:
                bar.style.margin = "0 1px"

            bar.title = str(val)
            self.container.appendChild(bar)

    def reset_stats(self):
        self.operations = 0
        self.ops_display.innerText = "0"
        self.timer_display.innerText = "0.00s"
        if self.timer_task: self.timer_task.cancel()

    async def update_timer_loop(self):
        self.start_time = time.time()
        self.total_paused_time = 0

        while self.is_sorting and not self.abort_sort:
            if not self.is_paused:
                elapsed = time.time() - self.start_time - self.total_paused_time
                self.timer_display.innerText = f"{elapsed:.2f}s"
            await asyncio.sleep(0.05)

    def get_delay(self):
        speed = int(self.speed_slider.value)
        return (400 - (speed * 3.8)) / 1000

    async def sleep_step(self):
        while self.is_paused:
            if self.abort_sort: return
            await asyncio.sleep(0.1)

        if self.abort_sort: return
        await asyncio.sleep(self.get_delay())

    async def start_sort(self, event):
        if self.is_sorting: return
        if not self.is_muted: self.init_audio()

        self.is_sorting = True
        self.abort_sort = False
        self.is_paused = False
        self.update_pause_btn()
        self.toggle_controls(False)

        self.timer_task = asyncio.create_task(self.update_timer_loop())

        algo = self.algo_select.value
        bars = document.getElementsByClassName('array-bar')

        try:
            if algo == 'bubble':
                await self.bubble_sort(bars)
            elif algo == 'selection':
                await self.selection_sort(bars)
            elif algo == 'insertion':
                await self.insertion_sort(bars)
            elif algo == 'merge':
                await self.merge_sort_wrapper(bars)
            elif algo == 'quick':
                await self.quick_sort_wrapper(bars)

            if not self.abort_sort:
                self.mark_all_sorted(bars)
                self.play_victory()
        except Exception as e:
            print(f"Error: {e}")
        finally:
            self.is_sorting = False
            self.is_paused = False
            if self.timer_task: self.timer_task.cancel()
            self.toggle_controls(True)
            self.update_pause_btn()

            if self.abort_sort:
                for i in range(len(bars)):
                    bars[i].style.backgroundColor = '#38bdf8'

    def increment_ops(self):
        self.operations += 1
        self.ops_display.innerText = f"{self.operations:,}"

    def mark_all_sorted(self, bars):
        for i in range(len(bars)):
            bars[i].classList.remove('bar-compare', 'bar-swap', 'bar-overwrite', 'bar-pivot')
            bars[i].classList.add('bar-sorted')

    #
    # --- ALGORITHMS ---
    #

    async def selection_sort(self, bars):
        n = len(self.array)
        for i in range(n):
            if self.abort_sort: return
            min_idx = i
            bars[i].classList.add('bar-pivot')
            await self.sleep_step()

            for j in range(i + 1, n):
                if self.abort_sort: return
                bars[j].classList.add('bar-compare')
                self.play_note(self.array[j])
                self.increment_ops()
                await self.sleep_step()

                if self.array[j] < self.array[min_idx]:
                    if min_idx != i:
                        bars[min_idx].classList.remove('bar-overwrite')
                    min_idx = j
                    bars[min_idx].classList.add('bar-overwrite')

                bars[j].classList.remove('bar-compare')

            if self.abort_sort: return

            if min_idx != i:
                bars[i].classList.add('bar-swap')
                bars[min_idx].classList.remove('bar-overwrite')
                bars[min_idx].classList.add('bar-swap')
                self.increment_ops()
                await self.sleep_step()

                self.array[i], self.array[min_idx] = self.array[min_idx], self.array[i]
                bars[i].style.height = f"{self.array[i] * 0.8}%"
                bars[min_idx].style.height = f"{self.array[min_idx] * 0.8}%"

                await self.sleep_step()
                bars[i].classList.remove('bar-swap')
                bars[min_idx].classList.remove('bar-swap')
            else:
                bars[min_idx].classList.remove('bar-overwrite')

            bars[i].classList.remove('bar-pivot')
            bars[i].classList.add('bar-sorted')
            await self.sleep_step()

    async def insertion_sort(self, bars):
        n = len(self.array)
        for i in range(1, n):
            if self.abort_sort: return
            key = self.array[i]
            bars[i].classList.add('bar-overwrite')
            await self.sleep_step()

            j = i - 1
            while j >= 0:
                if self.abort_sort: return
                bars[j].classList.add('bar-compare')
                self.play_note(self.array[j])
                self.increment_ops()
                await self.sleep_step()

                if self.array[j] > key:
                    bars[j + 1].classList.add('bar-swap')
                    bars[j].classList.add('bar-swap')
                    self.increment_ops()
                    await self.sleep_step()

                    self.array[j + 1] = self.array[j]
                    bars[j + 1].style.height = f"{self.array[j + 1] * 0.8}%"

                    bars[j + 1].classList.remove('bar-swap')
                    bars[j].classList.remove('bar-swap')
                    bars[j].classList.remove('bar-compare')
                    j -= 1
                else:
                    bars[j].classList.remove('bar-compare')
                    break

            self.array[j + 1] = key
            bars[j + 1].style.height = f"{self.array[j + 1] * 0.8}%"
            bars[j + 1].classList.remove('bar-overwrite')
            bars[j + 1].classList.add('bar-sorted')
            await self.sleep_step()

            for k in range(i + 1):
                if k != j + 1: bars[k].classList.remove('bar-compare')

        for i in range(n):
            bars[i].classList.add('bar-sorted')
            bars[i].classList.remove('bar-overwrite')

    async def bubble_sort(self, bars):
        n = len(self.array)
        for i in range(n - 1):
            if self.abort_sort: return
            for j in range(n - i - 1):
                if self.abort_sort: return
                bars[j].classList.add('bar-compare')
                bars[j + 1].classList.add('bar-compare')
                self.play_note(self.array[j])
                self.increment_ops()
                await self.sleep_step()

                if self.array[j] > self.array[j + 1]:
                    bars[j].classList.remove('bar-compare')
                    bars[j + 1].classList.remove('bar-compare')
                    bars[j].classList.add('bar-swap')
                    bars[j + 1].classList.add('bar-swap')
                    self.play_note(self.array[j + 1])
                    self.increment_ops()
                    await self.sleep_step()

                    self.array[j], self.array[j + 1] = self.array[j + 1], self.array[j]
                    bars[j].style.height = f"{self.array[j] * 0.8}%"
                    bars[j + 1].style.height = f"{self.array[j + 1] * 0.8}%"

                    await self.sleep_step()
                    bars[j].classList.remove('bar-swap')
                    bars[j + 1].classList.remove('bar-swap')
                else:
                    bars[j].classList.remove('bar-compare')
                    bars[j + 1].classList.remove('bar-compare')

            bars[n - i - 1].classList.add('bar-sorted')
        bars[0].classList.add('bar-sorted')

    async def merge_sort_wrapper(self, bars):
        await self.merge_sort(0, len(self.array) - 1, bars)

    async def merge_sort(self, start, end, bars):
        if start >= end or self.abort_sort: return
        mid = (start + end) // 2
        await self.merge_sort(start, mid, bars)
        await self.merge_sort(mid + 1, end, bars)
        await self.merge(start, mid, end, bars)

    async def merge(self, start, mid, end, bars):
        if self.abort_sort: return
        left = self.array[start:mid + 1]
        right = self.array[mid + 1:end + 1]

        i = 0
        j = 0
        k = start

        while i < len(left) and j < len(right):
            if self.abort_sort: return
            bars[k].classList.add('bar-overwrite')
            self.play_note(self.array[k])
            self.increment_ops()
            await self.sleep_step()

            if left[i] <= right[j]:
                self.array[k] = left[i]
                bars[k].style.height = f"{self.array[k] * 0.8}%"
                i += 1
            else:
                self.array[k] = right[j]
                bars[k].style.height = f"{self.array[k] * 0.8}%"
                j += 1

            self.increment_ops()
            await self.sleep_step()
            bars[k].classList.remove('bar-overwrite')
            bars[k].classList.add('bar-sorted')
            k += 1

        while i < len(left):
            if self.abort_sort: return
            bars[k].classList.add('bar-overwrite')
            self.play_note(self.array[k])
            self.increment_ops()
            await self.sleep_step()

            self.array[k] = left[i]
            bars[k].style.height = f"{self.array[k] * 0.8}%"

            await self.sleep_step()
            bars[k].classList.remove('bar-overwrite')
            bars[k].classList.add('bar-sorted')
            i += 1
            k += 1

        while j < len(right):
            if self.abort_sort: return
            bars[k].classList.add('bar-overwrite')
            self.play_note(self.array[k])
            self.increment_ops()
            await self.sleep_step()

            self.array[k] = right[j]
            bars[k].style.height = f"{self.array[k] * 0.8}%"

            await self.sleep_step()
            bars[k].classList.remove('bar-overwrite')
            bars[k].classList.add('bar-sorted')
            j += 1
            k += 1

    async def quick_sort_wrapper(self, bars):
        await self.quick_sort(0, len(self.array) - 1, bars)

    async def quick_sort(self, low, high, bars):
        if low < high:
            if self.abort_sort: return
            pi = await self.partition(low, high, bars)
            await self.quick_sort(low, pi - 1, bars)
            await self.quick_sort(pi + 1, high, bars)
        elif low == high:
            bars[low].classList.add('bar-sorted')

    async def partition(self, low, high, bars):
        if self.abort_sort: return 0
        pivot = self.array[high]
        bars[high].classList.add('bar-pivot')
        await self.sleep_step()

        i = low - 1

        for j in range(low, high):
            if self.abort_sort: return 0
            bars[j].classList.add('bar-compare')
            self.play_note(self.array[j])
            self.increment_ops()
            await self.sleep_step()

            if self.array[j] <= pivot:
                i = i + 1
                bars[i].classList.add('bar-swap')
                bars[j].classList.add('bar-swap')
                self.increment_ops()
                await self.sleep_step()

                self.array[i], self.array[j] = self.array[j], self.array[i]
                bars[i].style.height = f"{self.array[i] * 0.8}%"
                bars[j].style.height = f"{self.array[j] * 0.8}%"

                await self.sleep_step()
                bars[i].classList.remove('bar-swap')
                bars[j].classList.remove('bar-swap')

            bars[j].classList.remove('bar-compare')

        if self.abort_sort: return 0

        bars[i + 1].classList.add('bar-swap')
        bars[high].classList.add('bar-swap')
        self.increment_ops()
        await self.sleep_step()

        self.array[i + 1], self.array[high] = self.array[high], self.array[i + 1]
        bars[i + 1].style.height = f"{self.array[i + 1] * 0.8}%"
        bars[high].style.height = f"{self.array[high] * 0.8}%"

        await self.sleep_step()
        bars[i + 1].classList.remove('bar-swap')
        bars[high].classList.remove('bar-swap', 'bar-pivot')
        bars[i + 1].classList.add('bar-sorted')

        return i + 1


app = AlgoVisualizer()