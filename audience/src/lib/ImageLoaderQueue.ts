import * as cornerstone from '@cornerstonejs/core';

interface QueueItem {
    id: string;
    idx: number;
    priority: number;
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
    private onImageLoadStart: (index: number) => void;
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

    constructor(
        imageIds: string[],
        _legacyConcurrency: number, // Kept for backward compatibility but unused
        onImageLoaded: (index: number) => void,
        onImageLoadStart: (index: number) => void,
        isMobile: boolean = false
    ) {

        // Set base concurrency based on device
        // Mobile: Very conservative to prevent WASM memory exhaustion
        this.baseConcurrency = isMobile ? 1 : 3;
        // Mobile: Only 2x boost to avoid memory issues (1→2 instead of 2→4)
        this.idleConcurrency = isMobile ? 2 : 6;
        this.concurrency = this.baseConcurrency;

        this.onImageLoaded = onImageLoaded;
        this.onImageLoadStart = onImageLoadStart;

        // Populate initial queue
        this.queue = imageIds.map((id, idx) => ({
            id,
            idx,
            priority: this.calculatePriority(idx, 0)
        }));
    }

    private calculatePriority(index: number, focusIndex: number): number {
        const distance = Math.abs(index - focusIndex);

        // During scrolling: tight focus on nearby images only
        if (this.isScrolling) {
            // Outside prefetch window = very low priority, but always at least 1
            if (distance > this.PREFETCH_WINDOW) {
                return Math.max(1, 10 - distance); // Minimum priority of 1
            }

            // Within window: exponential proximity boost
            const proximityScore = Math.max(1, 1000 - (distance * distance));
            return proximityScore;
        }

        // When idle: broader coverage with keyframe strategy
        const isKeyframe = index % 10 === 0;
        const strideScore = isKeyframe ? 1000 : 0;

        const proximityScore = Math.max(1, 500 - distance); // Minimum priority of 1

        return strideScore + proximityScore;
    }

    public updateFocus(focusIndex: number) {
        // Throttle scroll events
        this.pendingFocusIndex = focusIndex;

        if (this.throttleTimeout) {
            // Already waiting, just update pending index
            return;
        }

        this.throttleTimeout = setTimeout(() => {
            if (this.pendingFocusIndex !== null) {
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

            // Re-prioritize with idle strategy
            if (this.currentFocusIndex !== null) {
                this.applyFocusUpdate(this.currentFocusIndex);
            }
        }, this.IDLE_THRESHOLD_MS);
    }

    private applyFocusUpdate(focusIndex: number) {
        this.currentFocusIndex = focusIndex;

        // OPTIMIZATION: Only re-prioritize items near the focus during scrolling
        // During idle state, re-prioritize everything
        const shouldFullReprioritize = !this.isScrolling;

        if (shouldFullReprioritize) {
            // Full re-prioritization when idle (broader coverage strategy)
            this.queue.forEach(item => {
                item.priority = this.calculatePriority(item.idx, this.currentFocusIndex);
            });
        } else {
            // Selective re-prioritization during scroll (only visible window)
            // This reduces O(n) operations during rapid scrolling
            const REPRIORITIZE_WINDOW = this.PREFETCH_WINDOW * 2;
            this.queue.forEach(item => {
                const distance = Math.abs(item.idx - this.currentFocusIndex);
                if (distance <= REPRIORITIZE_WINDOW) {
                    item.priority = this.calculatePriority(item.idx, this.currentFocusIndex);
                }
            });
        }

        // Sort once: Highest priority first
        this.queue.sort((a, b) => b.priority - a.priority);

        this.processNext();
    }

    public start() {
        // Trigger initial idle state
        this.handleScrollActivity();
        this.processNext();
    }

    public markAsLoaded(index: number) {
        // Mark an image as already loaded (e.g., the initial image)
        this.loaded.add(index);
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
    }

    private async processNext() {
        if (this.isDestroyed) return;

        // While we have slots open and items in queue
        while (this.processing.size < this.concurrency && this.queue.length > 0) {
            // Double check inside loop in case state changed async
            if (this.isDestroyed) return;

            // OPTIMIZATION: Queue is already sorted by applyFocusUpdate, no need to sort again
            // Just shift the highest priority item (at index 0)
            const item = this.queue.shift();
            if (!item) break;

            if (this.loaded.has(item.idx)) continue;

            this.processing.add(item.id);

            // Notify that loading is starting
            this.onImageLoadStart(item.idx);

            // Fetch
            try {
                await cornerstone.imageLoader.loadAndCacheImage(item.id, {
                    priority: 10,
                    requestType: 'prefetch'
                });

                if (!this.isDestroyed) {
                    this.loaded.add(item.idx);
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
}
