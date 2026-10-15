/* ==========================================================================
   main.js · 导航高亮 / 深色章节切色 / 性能档位 / 灯箱 / 视频懒加载
   ========================================================================== */
(() => {
  'use strict';

  const doc = document.documentElement;
  doc.classList.remove('nojs');

  /* ---------- 1. 顶部导航：滚动实心 + 当前章节高亮 + data-tone 切色 ---------- */
  const nav = document.querySelector('[data-nav]');
  if (nav) {
    const links = Array.from(nav.querySelectorAll('nav a[data-sec]'));
    const sections = Array.from(document.querySelectorAll('[data-section]'));

    // 滚动超过 40px 加半透明底 + 1px 分隔线
    let solid = false;
    const onScroll = () => {
      const next = window.scrollY > 40;
      if (next !== solid) {
        solid = next;
        nav.toggleAttribute('data-solid', solid);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // 顶部窄带内的章节即为「当前章节」
    if ('IntersectionObserver' in window && sections.length) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const sec = e.target.dataset.section;
            links.forEach((a) => {
              const on = a.dataset.sec === sec;
              a.toggleAttribute('data-active', on);
              // 高亮与 aria-current 必须同步，否则会同时出现两条下划线
              if (on) a.setAttribute('aria-current', 'page');
              else a.removeAttribute('aria-current');
            });
            nav.dataset.tone = e.target.dataset.tone || 'paper';
          }
        },
        { rootMargin: '-32px 0px -95% 0px' }
      );
      sections.forEach((s) => io.observe(s));
    }
  }

  /* ---------- 2. 性能档位（材质/动画质量），localStorage 记忆 ---------- */
  const TIERS = ['auto', 'high', 'balanced', 'lite'];
  const tierBtn = document.querySelector('[data-tier-btn]');
  const tierLabel = document.querySelector('[data-tier-label]');

  const readTier = () => {
    try {
      const v = localStorage.getItem('sd:tier');
      return TIERS.includes(v) ? v : 'auto';
    } catch (e) {
      return 'auto';
    }
  };
  const applyTier = (v) => {
    doc.dataset.tier = v;
    if (tierLabel) tierLabel.textContent = v[0].toUpperCase() + v.slice(1);
    try {
      localStorage.setItem('sd:tier', v);
    } catch (e) {
      /* 隐私模式下静默失败 */
    }
    window.dispatchEvent(new CustomEvent('tierchange', { detail: v }));
  };
  applyTier(readTier());
  if (tierBtn) {
    tierBtn.addEventListener('click', () => {
      const cur = readTier();
      applyTier(TIERS[(TIERS.indexOf(cur) + 1) % TIERS.length]);
    });
  }

  /* ---------- 3. 灯箱（美工海报 / PPT 页） ---------- */
  const lb = document.querySelector('[data-lb]');
  if (lb) {
    const img = lb.querySelector('img');
    const cap = lb.querySelector('.cap');
    let opener = null;

    const close = () => {
      if (!lb.hasAttribute('data-open')) return;
      lb.removeAttribute('data-open');
      document.body.style.overflow = '';
      if (opener) opener.focus();
    };
    const open = (src, alt, label, from) => {
      img.src = src;
      img.alt = alt || '';
      if (cap) cap.textContent = label || '';
      lb.setAttribute('data-open', '');
      document.body.style.overflow = 'hidden';
      opener = from || null;
      lb.querySelector('.x').focus();
    };

    document.querySelectorAll('[data-lb-src]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        open(el.dataset.lbSrc, el.dataset.lbAlt, el.dataset.lbCap, el);
      });
    });

    lb.addEventListener('click', (ev) => {
      if (ev.target === lb || ev.target.classList.contains('x')) close();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') close();
    });
  }

  /* ---------- 4. 视频：进入视口才加载；静音循环预览，点击后带声播放 ---------- */
  const vids = Array.from(document.querySelectorAll('video[data-video]'));
  if (vids.length) {
    const pauseAll = (except) => {
      vids.forEach((v) => {
        if (v === except) return;
        v.pause();
        if (v.hasAttribute('controls')) {
          v.removeAttribute('controls');
          v.muted = true;
          v.currentTime = 0;
          v.closest('.phone')?.removeAttribute('data-playing');
        }
      });
    };

    if ('IntersectionObserver' in window) {
      const vio = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const v = e.target;
            if (e.isIntersecting) {
              if (!v.dataset.loaded) {
                v.dataset.loaded = '1';
                v.preload = 'auto';
                v.load();
              }
              if (!v.hasAttribute('controls')) v.play().catch(() => {});
            } else {
              v.pause();
            }
          }
        },
        { rootMargin: '200px 0px' }
      );
      vids.forEach((v) => vio.observe(v));
    }

    document.querySelectorAll('[data-play]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const v = btn.closest('.phone')?.querySelector('video');
        if (!v) {
          window.open(btn.dataset.play, '_blank', 'noopener');
          return;
        }
        pauseAll(v);
        v.muted = false;
        v.loop = false;
        v.currentTime = 0;
        v.setAttribute('controls', '');
        v.closest('.phone').setAttribute('data-playing', '');
        v.play().catch(() => {});
      });
    });

    vids.forEach((v) => {
      v.addEventListener('ended', () => {
        v.removeAttribute('controls');
        v.muted = true;
        v.loop = true;
        v.currentTime = 0;
        v.closest('.phone')?.removeAttribute('data-playing');
        v.play().catch(() => {});
      });
      v.addEventListener('pause', () => {
        if (!v.hasAttribute('controls')) return;
      });
    });

    // 页面不可见时暂停，省电
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) vids.forEach((v) => v.pause());
    });
  }
})();
