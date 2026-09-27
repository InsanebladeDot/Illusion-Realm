"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, ImageIcon, Video } from "lucide-react";
import { AppLogo } from "@/assets/AppLogo";
import { useTranslation } from "@/i18n";
import { resolvePageDirection, startPageNavigation } from "@/utils/pageTransition";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

/*
 * 首页概念页（用户给的图 2 结构 + 图 1 的柔和风格），严格四层：
 *   1. 背景层：天空渐变 + 云团 + 日光 + 城市剪影 —— 纯 CSS/SVG，不引外部图
 *      （不引入授权问题，也不依赖网络；用户说图 3 可当作背景板，这里用等价的做法替代）
 *   2. 装饰层：飘落花瓣 + 星芒（两个循环动画，见 globals.css）
 *   3. 品牌层：拾光制作组 · Illusion Realm · 标语 · 简介
 *   4. 功能层：两张半透明卡片（图片创作 / 视频创作）+「探索更多功能」
 * 背景与 UI 分层是关键：桌面应用不是全屏 CG，卡片一律是半透明浮在背景上，
 * 而不是把元素直接铺在背景图上 —— 图 1 也是这个做法（淡蓝紫底 + 白色浮卡）。
 */

/** 背景层：用户原创的 AI 图铺满（图 2），上面压一层可读性渐变 */
function HeroBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/** 用 img 而不是 CSS background：静态导出下路径由 Next 处理不了 `public` 里的中文名，这里路径是纯 ASCII */}
      <img
        src="/home-hero.jpg"
        alt=""
        aria-hidden
        /**
         * A+B 方案里的 B：裁切点右移 + 稍下移，把人物主体推到右侧，
         * 左边多露出天空与远景 —— 给文案腾出一块「安静区」（原来人脸正好在正中）。
         */
        className="h-full w-full scale-[1.02] object-cover object-[72%_42%]"
      />
      {/**
       * A 方案：遮罩从「上下压暗」改成**从左到右**的横向渐变。
       * 文字区在左 → 左侧压到 70%，右侧完全透明把主视觉让出来；
       * 原来的居中压暗会让整张图发灰、却仍然救不了压在脸上的那行字。
       */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/75 via-slate-950/30 to-transparent" />
    </div>
  );
}

/**
 * 底部潮水：照搬用户原项目的 SVG 做法（`defs` + `gentle-wave` + 四层 `<use>`）。
 *
 * 相对原版只改了两处：
 *   · **幅度调大**：控制点偏移 18 → 30，viewBox 高度 28 → 40，元素高度 15vh → 16vh；
 *   · 配色换成主题 token（`text-background/xx` + `fill="currentColor"`），
 *     这样最上面那层与页面底色严丝合缝 —— 视觉上「图从浪里长出来」。
 */
const WAVE_LAYERS = ["text-background/25", "text-background/50", "text-background/75", "text-background"] as const;

function HeroWaves() {
  return (
    <svg
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
      /**
       * 关键不是比例，是**窗口里装了几个周期**。
       *
       * 上一版把 viewBox 与路径同时放大 4 倍 —— 比值没变，屏幕上依旧只有约 **一个** 波峰，
       * 所以看起来还是「一道被压平的弧」。现在：窗口 600 单位、波长仍是 176 单位
       * ⇒ 一屏约 3.4 个周期，波形才立得起来。
       */
      viewBox="0 12 600 60"
      preserveAspectRatio="none"
      shapeRendering="auto"
      className="home-waves pointer-events-none absolute inset-x-0 bottom-0 h-[18vh] max-h-[240px] min-h-[130px] w-full"
    >
      <defs>
        <path
          id="home-gentle-wave"
          d="M-176 48c30 0 58-36 88-36s58 36 88 36 58-36 88-36 58 36 88 36 58-36 88-36 58 36 88 36 58-36 88-36 58 36 88 36 58-36 88-36 58 36 88 36 v60h-1056z"
        />
      </defs>
      <g>
        {WAVE_LAYERS.map((colorClass, index) => (
          <use
            key={colorClass}
            href="#home-gentle-wave"
            x="48"
            y={index * 3}
            fill="currentColor"
            className={colorClass}
          />
        ))}
      </g>
    </svg>
  );
}

/** 装饰层元素位置写死在表里：随机数会让同一处渲染两次位置不同。 */
const PETALS = [
  { left: "12%", top: "8%", delay: "0s", size: 10 },
  { left: "28%", top: "3%", delay: "1.6s", size: 8 },
  { left: "48%", top: "6%", delay: "3.2s", size: 11 },
  { left: "67%", top: "4%", delay: "2.4s", size: 9 },
  { left: "83%", top: "10%", delay: "4.1s", size: 12 },
] as const;

const SPARKLES = [
  { left: "18%", top: "34%", delay: "0s" },
  { left: "38%", top: "22%", delay: "0.7s" },
  { left: "56%", top: "40%", delay: "1.3s" },
  { left: "72%", top: "26%", delay: "0.4s" },
  { left: "88%", top: "46%", delay: "1.9s" },
] as const;

function HeroDecorations() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {PETALS.map((petal) => (
        <span
          key={`${petal.left}-${petal.delay}`}
          className="home-petal absolute rounded-[60%_40%_60%_40%] bg-rose-300/80 dark:bg-rose-200/40"
          style={{
            left: petal.left,
            top: petal.top,
            width: petal.size,
            height: petal.size * 0.7,
            animationDelay: petal.delay,
          }}
        />
      ))}
      {SPARKLES.map((sparkle) => (
        <span
          key={`${sparkle.left}-${sparkle.delay}`}
          className="home-sparkle absolute h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_10px_2px_rgba(255,255,255,0.8)]"
          style={{ left: sparkle.left, top: sparkle.top, animationDelay: sparkle.delay }}
        />
      ))}
    </div>
  );
}

function HeroActionCard({
  title,
  description,
  icon: Icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: typeof ImageIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-2xl bg-white/70 p-4 text-left backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-lg dark:bg-zinc-900/50 dark:hover:bg-zinc-900/70",
        THIN_BORDER_CLASS
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

export function HomeHero() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  /** 与侧边栏同一套页面切换动画（进去 = 新内容从右推入） */
  const go = (href: string) =>
    startPageNavigation({
      href,
      push: () => router.push(href),
      direction: resolvePageDirection(pathname, href),
    });

  return (
    <section data-home-hero className="relative min-h-[100dvh] w-full">
      {/**
       * 背景与装饰用 **fixed** 铺满整个视口（用户要求）：
       * 图永远盖住整屏，下面的内容滚动时从图上滑过去 —— 这也是原项目那套做法的位置关系
       * （`.header` 绝对定位在视口底部、内容区带自己的底色在后面盖上来）。
       */}
      {/**
       * 这一层**不能**用负 z-index：AppShell 的根节点自带不透明的 `bg-background`，
       * 负值会把图和波浪推到那层底色后面 —— 症状就是「图和 SVG 都不见了，只剩文字」。
       * 用 z-0 + 内容层 z-10 的正常叠序即可。
       */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <HeroBackdrop />
        <HeroDecorations />
        <HeroWaves />
        {/** 左上角原来放 AppLogo（用户要求移除），只留版本号 */}
        <span className="absolute right-5 top-5 text-[10px] font-medium text-white/70">
          Ver 1.0
        </span>
      </div>

      {/** 品牌层：压在图上，白字 + 投影保证任何底色上都读得清 */}
      <div className="relative z-10 flex min-h-[100dvh] flex-col items-start justify-center px-8 pb-[16vh] text-left text-white drop-shadow-[0_2px_12px_rgba(15,23,42,0.6)] sm:px-14 lg:px-20">
        <div className="w-full max-w-[560px]">
        <p className="text-[10px] font-medium tracking-[0.28em] text-white/80">
          {t("home.hero.studio")}
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-6xl">
          {t("home.hero.title")}
        </h1>
        <p className="mt-3 text-lg font-medium sm:text-2xl">{t("home.hero.tagline")}</p>
        <p className="mt-4 text-xs leading-relaxed text-white/85 sm:text-sm">
          {t("home.hero.about")}
        </p>

        {/** 功能层：半透明卡片浮在图上 */}
        <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        <HeroActionCard
          icon={ImageIcon}
          title={t("home.hero.imageCard.title")}
          description={t("home.hero.imageCard.description")}
          onClick={() => go("/create")}
        />
        <HeroActionCard
          icon={Video}
          title={t("home.hero.videoCard.title")}
          description={t("home.hero.videoCard.description")}
          onClick={() => go("/create")}
        />
        </div>

        <button
          type="button"
          data-home-hero-explore
          onClick={() => go("/toolBox")}
          className={cn(
            "mt-3 flex w-full items-center justify-between rounded-2xl bg-white/25 px-4 py-3 text-left text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/35",
            "border border-white/30"
          )}
        >
          {t("home.hero.explore")}
          <ArrowRight className="h-4 w-4" />
        </button>
        </div>
      </div>
    </section>
  );
}
