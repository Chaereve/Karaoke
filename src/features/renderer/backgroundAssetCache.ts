class BackgroundAssetCache {
  private imageCache = new Map<string, HTMLImageElement>();
  private videoCache = new Map<string, HTMLVideoElement>();
  private onAssetLoadedCallback: (() => void) | null = null;

  public setOnAssetLoaded(cb: (() => void) | null): void {
    this.onAssetLoadedCallback = cb;
  }

  public getImage(url?: string): HTMLImageElement | null {
    if (!url) return null;
    const existing = this.imageCache.get(url);
    if (existing) {
      return existing.complete && existing.naturalWidth > 0 ? existing : null;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this.onAssetLoadedCallback) {
        this.onAssetLoadedCallback();
      }
    };
    img.src = url;
    this.imageCache.set(url, img);
    return null;
  }

  public getVideo(url?: string, songTime = 0, isPlaying = false): HTMLVideoElement | null {
    if (!url) return null;
    let video = this.videoCache.get(url);

    if (!video) {
      video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = url;
      video.onloadeddata = () => {
        if (this.onAssetLoadedCallback) {
          this.onAssetLoadedCallback();
        }
      };
      this.videoCache.set(url, video);
    }

    if (video.readyState >= 2 && video.duration > 0) {
      const targetTime = songTime % video.duration;
      if (isPlaying) {
        if (video.paused) {
          void video.play().catch(() => {});
        }
        if (Math.abs(video.currentTime - targetTime) > 0.3) {
          video.currentTime = targetTime;
        }
      } else {
        if (!video.paused) {
          video.pause();
        }
        if (Math.abs(video.currentTime - targetTime) > 0.04) {
          video.currentTime = targetTime;
        }
      }
      return video;
    }

    return null;
  }

  public async seekVideoDeterministic(
    url: string | undefined,
    songTime: number
  ): Promise<HTMLVideoElement | null> {
    if (!url) return null;
    let video = this.videoCache.get(url);

    if (!video) {
      video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = url;
      this.videoCache.set(url, video);
    }

    if (video.readyState < 1) {
      await new Promise<void>((resolve) => {
        if (!video) return resolve();
        const onLoaded = () => {
          video?.removeEventListener('loadedmetadata', onLoaded);
          video?.removeEventListener('error', onLoaded);
          resolve();
        };
        video.addEventListener('loadedmetadata', onLoaded);
        video.addEventListener('error', onLoaded);
      });
    }

    if (!video.duration || Number.isNaN(video.duration)) {
      return null;
    }

    if (!video.paused) {
      video.pause();
    }

    const targetTime = Math.max(0, songTime % video.duration);
    if (Math.abs(video.currentTime - targetTime) > 0.01) {
      await new Promise<void>((resolve) => {
        if (!video) return resolve();
        const timeout = window.setTimeout(() => {
          video?.removeEventListener('seeked', onSeeked);
          resolve();
        }, 250);
        const onSeeked = () => {
          window.clearTimeout(timeout);
          video?.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = targetTime;
      });
    }

    return video;
  }

  public clear(): void {
    this.videoCache.forEach((video) => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
    this.videoCache.clear();
    this.imageCache.clear();
  }
}

export const backgroundAssetCache = new BackgroundAssetCache();
