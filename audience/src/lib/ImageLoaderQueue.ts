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
    private currentFocusIndex: number = 0;
    private onImageLoaded: (index: number) => void;
    private isDestroyed = false;

    constructor(
        imageIds: string[],
        concurrency: number,
        onImageLoaded: (index: number) => void
    ) {
        this.concurrency = concurrency;
        this.onImageLoaded = onImageLoaded;

        // Populate initial queue
        this.queue = imageIds.map((id, idx) => ({
            id,
            idx,
            priority: this.calculatePriority(idx, 0)
        }));

        // Remove 0th image if it's already handled by initial load, 
        // but here we assume we manage everything. 
        // Logic will skip if already loaded.
    }

    private calculatePriority(index: number, focusIndex: number): number {
        // 1. Stride Priority (Broad Phase)
        // High priority for every 10th image (0, 10, 20...)
        const isKeyframe = index % 10 === 0;
        const strideScore = isKeyframe ? 1000 : 0;

        // 2. Proximity Priority (Focus Phase)
        // Higher score the closer to the user's current view
        const distance = Math.abs(index - focusIndex);
        // Invert distance: closer = higher score. max 500.
        const proximityScore = Math.max(0, 500 - distance);

        return strideScore + proximityScore;
    }

    public updateFocus(focusIndex: number) {
        this.currentFocusIndex = focusIndex;
        // Re-calculate priorities
        this.queue.forEach(item => {
            item.priority = this.calculatePriority(item.idx, this.currentFocusIndex);
        });
        // Sort: Highest priority first
        this.queue.sort((a, b) => b.priority - a.priority);

        this.processNext();
    }

    public start() {
        this.processNext();
    }

    public destroy() {
        this.isDestroyed = true;
        this.queue = [];
    }

    private async processNext() {
        if (this.isDestroyed) return;

        // While we have slots open and items in queue
        while (this.processing.size < this.concurrency && this.queue.length > 0) {

            // Pick highest priority
            // Since we sort on updateFocus, and pop is O(1) from end, 
            // actually shift() is O(N). Let's just re-sort or find max?
            // For N=100 or 500, simple sort is fine.
            // Optimization: If not sorted recently? 
            // Let's just sort here to be safe and lazy.
            this.queue.sort((a, b) => b.priority - a.priority);

            const item = this.queue.shift();
            if (!item) break;

            if (this.loaded.has(item.idx)) continue;

            this.processing.add(item.id);

            // Fetch
            try {
                // We use a high priority here so Cornerstone actually processes our decision immediately
                await cornerstone.imageLoader.loadAndCacheImage(item.id, {
                    priority: 10, // Arbitrary high positive since we manage the throttle
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
