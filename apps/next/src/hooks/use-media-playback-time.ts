"use client";

/** 播放时逐帧读取真实媒体时钟，像持续看秒表，不按旧 timeupdate 事件一步步跳或自行猜时间。 */
import { useEffect, useState, type RefObject } from "react";

export function useMediaPlaybackTime(player: RefObject<HTMLMediaElement | null>, enabled: boolean, fallback: number) {
  const [time, setTime] = useState(fallback);
  useEffect(() => {
    const media = player.current;
    if (!enabled || !media) return;
    let frame = 0;
    const read = () => setTime(Number.isFinite(media.currentTime) ? media.currentTime : 0);
    const stop = () => { cancelAnimationFrame(frame); frame = 0; read(); };
    const tick = () => { read(); frame = media.paused || media.ended ? 0 : requestAnimationFrame(tick); };
    const start = () => { cancelAnimationFrame(frame); tick(); };
    const seeked = () => { if (media.paused || media.ended) read(); else start(); };
    const events = { playing: start, pause: stop, waiting: stop, ended: stop, seeking: stop, seeked, timeupdate: read, error: stop };
    for (const [name, listener] of Object.entries(events)) media.addEventListener(name, listener);
    read();
    if (!media.paused && !media.ended) start();
    // 换源、删除或离开时撤掉本播放器的帧循环和监听，不影响其他卡片。
    return () => { cancelAnimationFrame(frame); for (const [name, listener] of Object.entries(events)) media.removeEventListener(name, listener); };
  }, [player, enabled]);
  return enabled ? time : fallback;
}
