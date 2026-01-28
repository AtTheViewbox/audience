import * as cornerstone from '@cornerstonejs/core';

interface QueueItem {
    id: string;
    idx: number;
    priority: number;
}

interface PerformanceMetrics {
    totalImages: number;
    imagesLoaded: number;
    startTime: number;
    firstImageLoadTime: number | null;
    allImagesLoadTime: number | null;
    priorityRecalculations: number;
    scrollEvents: number;
    throttledScrollEvents: number;
    averageConcurrency: number;
    peakConcurrency: number;
    idleBoostActivations: number;
}

export class ImageLoaderQueue {
    private queue: QueueItem[] = [];
    private processing = new Set<string>();
    private loaded = new Set<number>();
    private concurrency: number;
    private baseConcurrency: number;
    private idleConcurrency: number;
    private currentFocusIndex: number = 0;
    private onImageLoaded: (index: number) => void;
    private isDestroyed = false;

    // Scroll throttling
    private throttleTimeout: NodeJS.Timeout | null = null;
    private pendingFocusIndex: number | null = null;
    private readonly THROTTLE_MS = 200;

    // Idle detection
    private idleTimeout: NodeJS.Timeout | null = null;
    private readonly IDLE_THRESHOLD_MS = 500;
    private isScrolling = false;

    // Prefetch window
    private readonly PREFETCH_WINDOW = 30;

    // Performance metrics
    private metrics: PerformanceMetrics;
    private concurrencySamples: number[] = [];

    constructor(
        imageIds: string[],
        _legacyConcurrency: number, // Kept for backward compatibility but unused
        onImageLoaded: (index: number) => void,
        isMobile: boolean = false
    ) {

        // Set base concurrency based on device
        // Mobile: Very conservative to prevent WASM memory exhaustion
        this.baseConcurrency = isMobile ? 1 : 3;
        // Mobile: Only 2x boost to avoid memory issues (1→2 instead of 2→4)
        this.idleConcurrency = isMobile ? 2 : 6;
        this.concurrency = this.baseConcurrency;

        this.onImageLoaded = onImageLoaded;

        // Initialize performance metrics
        this.metrics = {
            totalImages: imageIds.length,
            imagesLoaded: 0,
            startTime: Date.now(),
            firstImageLoadTime: null,
            allImagesLoadTime: null,
            priorityRecalculations: 0,
            scrollEvents: 0,
            throttledScrollEvents: 0,
            averageConcurrency: 0,
            peakConcurrency: 0,
            idleBoostActivations: 0
        };

        // Populate initial queue
        this.queue = imageIds.map((id, idx) => ({
            id,
            idx,
            priority: this.calculatePriority(idx, 0)
        }));

        // Start concurrency sampling
        this.startConcurrencySampling();
    }

    private startConcurrencySampling() {
        const sampleInterval = setInterval(() => {
            if (this.isDestroyed) {
                clearInterval(sampleInterval);
                return;
            }
            const current = this.processing.size;
            this.concurrencySamples.push(current);
            if (current > this.metrics.peakConcurrency) {
                this.metrics.peakConcurrency = current;
            }
        }, 100);
    }

    private calculatePriority(index: number, focusIndex: number): number {
        const distance = Math.abs(index - focusIndex);

        // During scrolling: tight focus on nearby images only
        if (this.isScrolling) {
            // Outside prefetch window = very low priority
            if (distance > this.PREFETCH_WINDOW) {
                return Math.max(0, 10 - distance); // Very low, but not zero
            }

            // Within window: exponential proximity boost
            const proximityScore = Math.max(0, 1000 - (distance * distance));
            return proximityScore;
        }

        // When idle: broader coverage with keyframe strategy
        const isKeyframe = index % 10 === 0;
        const strideScore = isKeyframe ? 1000 : 0;

        const proximityScore = Math.max(0, 500 - distance);

        return strideScore + proximityScore;
    }

    public updateFocus(focusIndex: number) {
        this.metrics.scrollEvents++;

        // Throttle scroll events
        this.pendingFocusIndex = focusIndex;

        if (this.throttleTimeout) {
            // Already waiting, just update pending index
            return;
        }

        this.throttleTimeout = setTimeout(() => {
            if (this.pendingFocusIndex !== null) {
                this.metrics.throttledScrollEvents++;
                this.applyFocusUpdate(this.pendingFocusIndex);
                this.pendingFocusIndex = null;
            }
            this.throttleTimeout = null;
        }, this.THROTTLE_MS);

        // Mark as scrolling and reset idle timer
        this.handleScrollActivity();
    }

    private handleScrollActivity() {
        // Clear previous idle timeout
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
        }

        // Mark as scrolling
        if (!this.isScrolling) {
            this.isScrolling = true;
            // Reduce concurrency during scroll
            this.concurrency = this.baseConcurrency;
        }

        // Set new idle timeout
        this.idleTimeout = setTimeout(() => {
            this.isScrolling = false;
            // Boost concurrency when idle
            this.concurrency = this.idleConcurrency;
            this.metrics.idleBoostActivations++;

            // Re-prioritize with idle strategy
            if (this.currentFocusIndex !== null) {
                this.applyFocusUpdate(this.currentFocusIndex);
            }
        }, this.IDLE_THRESHOLD_MS);
    }

    private applyFocusUpdate(focusIndex: number) {
        this.currentFocusIndex = focusIndex;
        this.metrics.priorityRecalculations++;

        // Re-calculate priorities
        this.queue.forEach(item => {
            item.priority = this.calculatePriority(item.idx, this.currentFocusIndex);
        });

        // Sort: Highest priority first
        this.queue.sort((a, b) => b.priority - a.priority);

        this.processNext();
    }

    public start() {
        // Trigger initial idle state
        this.handleScrollActivity();
        this.processNext();
    }

    public pause() {
        this.isDestroyed = true; // Reuse destroyed flag to stop processing
    }

    public resume() {
        if (this.isDestroyed) {
            this.isDestroyed = false;
            this.processNext(); // Resume processing
        }
    }

    public isPaused(): boolean {
        return this.isDestroyed;
    }

    public destroy() {
        this.isDestroyed = true;
        this.queue = [];

        if (this.throttleTimeout) {
            clearTimeout(this.throttleTimeout);
        }
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
        }

        // Log final metrics
        this.logMetrics();
    }

    private async processNext() {
        if (this.isDestroyed) return;

        // While we have slots open and items in queue
        while (this.processing.size < this.concurrency && this.queue.length > 0) {

            // Sort to get highest priority
            this.queue.sort((a, b) => b.priority - a.priority);

            const item = this.queue.shift();
            if (!item) break;

            if (this.loaded.has(item.idx)) continue;

            this.processing.add(item.id);

            // Fetch
            try {
                await cornerstone.imageLoader.loadAndCacheImage(item.id, {
                    priority: 10,
                    requestType: 'prefetch'
                });

                if (!this.isDestroyed) {
                    this.loaded.add(item.idx);
                    this.metrics.imagesLoaded++;

                    // Track first image load time
                    if (this.metrics.firstImageLoadTime === null) {
                        this.metrics.firstImageLoadTime = Date.now() - this.metrics.startTime;
                    }

                    // Track all images loaded time
                    if (this.metrics.imagesLoaded === this.metrics.totalImages) {
                        this.metrics.allImagesLoadTime = Date.now() - this.metrics.startTime;
                    }

                    this.onImageLoaded(item.idx);
                }
            } catch (e) {
                console.error(`Failed to load image ${item.idx}`, e);
            } finally {
                this.processing.delete(item.id);
                // Trigger next
                this.processNext();
            }
        }
    }

    public getMetrics(): PerformanceMetrics {
        // Calculate average concurrency
        if (this.concurrencySamples.length > 0) {
            const sum = this.concurrencySamples.reduce((a, b) => a + b, 0);
            this.metrics.averageConcurrency = sum / this.concurrencySamples.length;
        }

        return { ...this.metrics };
    }

    private logMetrics() {
        const metrics = this.getMetrics();

        console.group('📊 Image Loading Performance Metrics');
        console.log(`📦 Total Images: ${metrics.totalImages}`);
        console.log(`✅ Images Loaded: ${metrics.imagesLoaded}`);
        console.log(`⏱️  First Image: ${metrics.firstImageLoadTime}ms`);
        console.log(`🏁 All Images: ${metrics.allImagesLoadTime || 'N/A'}ms`);
        console.log(`📈 Scroll Events: ${metrics.scrollEvents} (throttled to ${metrics.throttledScrollEvents})`);
        console.log(`🔄 Priority Recalculations: ${metrics.priorityRecalculations}`);
        console.log(`⚡ Idle Boost Activations: ${metrics.idleBoostActivations}`);
        console.log(`🔢 Average Concurrency: ${metrics.averageConcurrency.toFixed(2)}`);
        console.log(`📊 Peak Concurrency: ${metrics.peakConcurrency}`);

        // Calculate efficiency
        const efficiency = ((metrics.throttledScrollEvents / Math.max(1, metrics.scrollEvents)) * 100).toFixed(1);
        console.log(`💡 Throttle Efficiency: ${efficiency}% reduction in processing`);

        console.groupEnd();
    }
}
