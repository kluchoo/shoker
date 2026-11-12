import { glassesHtml } from "./format.js";
import { playSpinSounds } from "./audio.js";
import { t } from "./i18n.js";

export function createAnim(ctx) {
  function motion(duration) {
    return ctx.reduceMotion ? 0 : duration;
  }

  function stopPour() {
    if (ctx.pourTl) {
      ctx.pourTl.kill();
      ctx.pourTl = null;
    }
    ctx.lastPourKey = "";
  }

  function animateWatch() {
    const watch = document.querySelector(".watch");
    if (!watch) {
      stopPour();
      return;
    }
    if (!window.gsap) return;
    const key = watch.dataset.watchKey || "";
    const mode = watch.dataset.watchMode;
    if (mode === "done") {
      stopPour();
      const verdict = watch.querySelector(".watch-verdict");
      if (verdict && key !== ctx.lastPourKey) {
        ctx.lastPourKey = key;
        gsap.from(verdict, {
          y: 18,
          scale: 0.92,
          autoAlpha: 0,
          duration: motion(0.45),
          ease: "back.out(1.4)",
          clearProps: "transform,opacity,visibility",
        });
        gsap.from(watch.querySelector(".watch-nick"), {
          y: 10,
          autoAlpha: 0,
          duration: motion(0.35),
          clearProps: "transform,opacity,visibility",
        });
      }
      return;
    }

    const bottle = watch.querySelector(".pour-bottle");
    const liquid = watch.querySelector(".pour-liquid");
    const label = watch.querySelector(".pour-label");
    if (!bottle || !liquid) return;
    if (key === ctx.lastPourKey && ctx.pourTl) return;

    stopPour();
    ctx.lastPourKey = key;

    gsap.set(bottle, { rotation: 0, x: 0, transformOrigin: "27px 108px" });
    gsap.set(liquid, { y: 0 });
    if (label) {
      gsap.fromTo(
        label,
        { autoAlpha: 0.45 },
        { autoAlpha: 1, duration: motion(0.9), yoyo: true, repeat: -1, ease: "sine.inOut" }
      );
    }

    if (ctx.reduceMotion) {
      gsap.set(bottle, { rotation: 26, x: 4 });
      gsap.set(liquid, { y: -30 });
      return;
    }

    ctx.pourTl = gsap.timeline({ repeat: -1, defaults: { ease: "power1.inOut" } });
    ctx.pourTl
      .set(liquid, { y: 0 })
      .to(bottle, { rotation: 28, x: 5, duration: 0.55 }, 0)
      .to(liquid, { y: -30, duration: 0.7, ease: "power1.out" }, 0.18)
      .to(bottle, { rotation: 0, x: 0, duration: 0.55 }, 1.05)
      .to(liquid, { y: 0, duration: 0.55 }, 1.15)
      .to({}, { duration: 0.3 });
  }

  function stopRevealCinema() {
    if (ctx.revealTl) {
      ctx.revealTl.kill();
      ctx.revealTl = null;
    }
    const row = document.querySelector(".board-row");
    if (row && window.gsap) gsap.set(row, { clearProps: "transform" });
    const count = document.querySelector(".board-count");
    if (count && window.gsap) gsap.set(count, { clearProps: "opacity,visibility" });
  }

  function updateBoardCount(openCount) {
    const count = document.querySelector(".board-count");
    if (!count) return;
    const hidden = Math.max(0, 5 - openCount);
    count.innerHTML = t("table.boardOpen", { open: openCount, hidden });
    const row = document.querySelector(".board-row");
    if (row) row.setAttribute("aria-label", t("table.boardAria", { open: openCount, hidden }));
  }

  function revealLift() {
    const row = document.querySelector(".board-row");
    const stage = document.querySelector(".stage-main") || document.querySelector(".stage");
    if (!row || !stage) return { x: 0, y: -28, scale: 1.2 };
    gsap.set(row, { x: 0, y: 0, scale: 1, transformOrigin: "50% 50%" });
    const rowRect = row.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    if (!rowRect.width || !stageRect.width) return { x: 0, y: -28, scale: 1.2 };
    const scale = Math.min(1.32, Math.max(1.14, (stageRect.width * 0.9) / rowRect.width));
    const targetX = stageRect.left + stageRect.width / 2;
    const targetY = stageRect.top + Math.min(stageRect.height * 0.36, 168);
    return {
      x: targetX - (rowRect.left + rowRect.width / 2),
      y: targetY - (rowRect.top + rowRect.height / 2),
      scale,
    };
  }

  function animateRevealSequence() {
    const board = document.querySelector(".board");
    const line = document.querySelector(".reveal-line");
    const row = document.querySelector(".board-row");
    if (!board || !window.gsap) return;

    const from = Number(board.dataset.revealed) || 0;
    const to = Number(board.dataset.revealTo) || from;
    const hand = board.dataset.hand || "0";
    const key = `${hand}:${ctx.state.street}:reveal`;
    if (key === ctx.lastRevealKey && ctx.revealTl) return;
    if (key === ctx.lastRevealKey && !ctx.revealTl && ctx.lastRevealed >= to) return;

    stopRevealCinema();
    if (ctx.cardTl) {
      ctx.cardTl.kill();
      ctx.cardTl = null;
    }
    ctx.lastRevealKey = key;

    const cards = [...board.querySelectorAll(".card")];
    const inners = cards.map((card) => card.querySelector(".card-inner"));
    inners.forEach((inner, index) => {
      gsap.set(inner, { rotationY: index < from ? 180 : 0 });
    });
    updateBoardCount(from);

    const fresh = inners.slice(from, to);
    const count = board.querySelector(".board-count");
    const finish = () => {
      ctx.lastRevealed = to;
      ctx.lastBoardKey = `${hand}:${to}`;
      updateBoardCount(to);
      fresh.forEach((_, i) => {
        const card = cards[from + i];
        if (card) card.classList.add("is-open");
      });
      if (row) gsap.set(row, { clearProps: "transform" });
      if (count) gsap.set(count, { clearProps: "opacity,visibility" });
    };

    if (ctx.reduceMotion || !fresh.length) {
      fresh.forEach((inner) => gsap.set(inner, { rotationY: 180 }));
      if (line) gsap.set(line, { autoAlpha: 1 });
      finish();
      return;
    }

    const lift = revealLift();
    if (line) gsap.set(line, { autoAlpha: 0, y: 16 });
    if (count) gsap.set(count, { autoAlpha: 0 });
    if (row) gsap.set(row, { transformOrigin: "50% 50%", x: 0, y: 0, scale: 1 });

    ctx.revealTl = gsap.timeline({
      defaults: { ease: "power2.out" },
      onComplete: () => {
        ctx.revealTl = null;
        finish();
      },
    });

    ctx.revealTl
      .to(
        row || board,
        {
          x: lift.x,
          y: lift.y,
          scale: lift.scale,
          duration: motion(0.55),
          ease: "power3.out",
        },
        0
      )
      .to(line, { autoAlpha: 1, y: 0, duration: motion(0.38) }, 0.18)
      .to(
        fresh,
        {
          rotationY: 180,
          duration: motion(0.62),
          stagger: 0.1,
          ease: "power2.inOut",
          onStart: () => updateBoardCount(to),
        },
        0.48
      )
      .to({}, { duration: motion(0.55) })
      .to(line, { autoAlpha: 0, y: -10, duration: motion(0.32) }, "+=0")
      .to(
        row || board,
        {
          x: 0,
          y: 0,
          scale: 1,
          duration: motion(0.5),
          ease: "power2.inOut",
        },
        "<0.04"
      )
      .to(count, { autoAlpha: 1, duration: motion(0.28) }, "-=0.18");
  }

  function animateBoard() {
    if (ctx.state && ctx.state.phase === "reveal") return;
    const board = document.querySelector(".board");
    if (!board || !window.gsap) return;
    const revealed = Number(board.dataset.revealed) || 0;
    const hand = board.dataset.hand || "0";
    const key = `${hand}:${revealed}`;
    const cards = [...board.querySelectorAll(".card")];
    const inners = cards.map((card) => card.querySelector(".card-inner"));
    const dealFresh =
      key !== ctx.lastBoardKey && (ctx.lastBoardKey === "" || !String(ctx.lastBoardKey).startsWith(`${hand}:`));
    const prevRevealed = ctx.lastRevealed < 0 || dealFresh ? 0 : ctx.lastRevealed;

    if (ctx.cardTl) {
      ctx.cardTl.kill();
      ctx.cardTl = null;
    }

    inners.forEach((inner, index) => {
      const open = index < revealed;
      const alreadyOpen = index < prevRevealed && !dealFresh;
      if (alreadyOpen) gsap.set(inner, { rotationY: 180 });
      else if (!open) gsap.set(inner, { rotationY: 0 });
    });

    if (dealFresh) {
      ctx.cardTl = gsap.timeline({ defaults: { ease: "power3.out" } });
      ctx.cardTl.from(cards, {
        y: 36,
        rotation: (i) => (i - 2) * 4,
        autoAlpha: 0,
        duration: motion(0.5),
        stagger: 0.05,
        clearProps: "transform,opacity,visibility",
      });
      const toFlip = inners.filter((_, index) => index < revealed);
      if (toFlip.length) {
        ctx.cardTl.to(
          toFlip,
          { rotationY: 180, duration: motion(0.55), stagger: 0.08, ease: "power2.inOut" },
          "-=0.15"
        );
      }
    } else {
      inners.forEach((inner, index) => {
        gsap.set(inner, { rotationY: index < revealed ? 180 : 0 });
      });
    }

    const oddsEl = document.querySelector(".odds-num");
    const oddsBlock = document.querySelector(".odds");
    const pct = oddsBlock ? Number(oddsBlock.dataset.pct) : null;
    if (oddsEl && pct != null && pct !== ctx.lastOddsPct) {
      const from = ctx.lastOddsPct == null ? 0 : ctx.lastOddsPct;
      const counter = { value: from };
      gsap.to(counter, {
        value: pct,
        duration: motion(0.45),
        ease: "power2.out",
        onUpdate: () => {
          oddsEl.innerHTML = `${Math.round(counter.value)}<small>%</small>`;
        },
      });
      ctx.lastOddsPct = pct;
    } else if (pct != null) {
      ctx.lastOddsPct = pct;
    }

    ctx.lastBoardKey = key;
    ctx.lastRevealed = revealed;
  }

  function animate(viewChanged) {
    if (!window.gsap) return;
    const stakeKey = ctx.state ? `${ctx.state.settings.entry}:${ctx.state.settings.allIn}` : "";
    if (viewChanged) {
      gsap.from("#root > *", {
        y: 24,
        autoAlpha: 0,
        duration: motion(0.55),
        stagger: 0.06,
        clearProps: "transform,opacity,visibility",
      });
    }
    document.querySelectorAll("[data-owed-id]").forEach((node) => {
      const id = node.dataset.owedId;
      const amount = Number(node.dataset.owed);
      const previous = ctx.owedMap[id];
      if (!viewChanged && previous != null && amount > previous) {
        gsap.from(node.querySelectorAll(".shot"), {
          y: 16,
          scale: 0.6,
          autoAlpha: 0,
          stagger: 0.05,
          duration: motion(0.45),
          ease: "back.out(1.8)",
          clearProps: "transform,opacity,visibility",
        });
      }
      ctx.owedMap[id] = amount;
    });
    if (ctx.chooseView(ctx.state) === "table") {
      if (ctx.state.phase === "reveal") {
        stopPour();
        animateRevealSequence();
      } else {
        if (ctx.state.phase !== "reveal") ctx.lastRevealKey = "";
        stopRevealCinema();
        animateBoard();
        animateWatch();
      }
    } else {
      stopPour();
      stopRevealCinema();
      ctx.lastRevealKey = "";
      ctx.lastBoardKey = "";
      ctx.lastRevealed = -1;
      ctx.lastOddsPct = null;
    }
    if (viewChanged) {
      ctx.lastStake = stakeKey;
      const shownName = document.querySelector(".name");
      const shownPrompt = document.querySelector(".prompt");
      if (shownName) ctx.lastWho = shownName.textContent;
      if (shownPrompt) ctx.lastPrompt = shownPrompt.textContent;
      return;
    }
    if (stakeKey !== ctx.lastStake) {
      ctx.lastStake = stakeKey;
      gsap.from(".stepper .liquid, .stakes .liquid, .stake-row .liquid", {
        scaleY: 0,
        transformOrigin: "50% 100%",
        stagger: 0.04,
        duration: motion(0.4),
        ease: "power2.out",
      });
    }
    const name = document.querySelector(".name");
    if (name && name.textContent !== ctx.lastWho) {
      ctx.lastWho = name.textContent;
      gsap.from(name, { y: 18, autoAlpha: 0, duration: motion(0.4), clearProps: "transform,opacity,visibility" });
    }
    const prompt = document.querySelector(".prompt");
    if (prompt && prompt.textContent !== ctx.lastPrompt) {
      ctx.lastPrompt = prompt.textContent;
      gsap.from(prompt, { y: 16, autoAlpha: 0, duration: motion(0.4), clearProps: "transform,opacity,visibility" });
    }
  }

  function finalAngle(spin) {
    return -(360 * 5 + spin.landing * (360 / spin.chambers));
  }

  function drawWheel(spin) {
    const size = spin.chambers >= 10 ? 34 : spin.chambers >= 8 ? 42 : 54;
    const step = 360 / spin.chambers;
    const chambers = spin.hot
      .map((hot, index) => {
        const rad = ((index * step) - 90) * Math.PI / 180;
        const left = 50 + Math.cos(rad) * 37;
        const top = 50 + Math.sin(rad) * 37;
        return `<i class="chamber ${hot ? "hot" : "safe"}" style="left:${left}%;top:${top}%;--ch:${size}px"></i>`;
      })
      .join("");
    ctx.overlay.hidden = false;
    ctx.overlay.className = "";
    ctx.overlay.innerHTML = `
    <div class="spin">
      <div class="wheel-wrap">
        <div class="pointer"></div>
        <div class="wheel">${chambers}</div>
      </div>
      <div class="spin-copy" hidden>
        <p class="spin-kicker"></p>
        <h2></h2>
        <p class="hint"></p>
      </div>
    </div>
  `;
  }

  function revealSpin(spin) {
    const wheel = ctx.overlay.querySelector(".wheel");
    if (wheel) {
      const chamber = wheel.children[spin.landing];
      if (chamber) chamber.classList.add("landed");
    }
    const copy = ctx.overlay.querySelector(".spin-copy");
    if (!copy) return;
    copy.hidden = false;
    const kicker = copy.querySelector(".spin-kicker");
    const title = copy.querySelector("h2");
    const hint = copy.querySelector(".hint");
    kicker.textContent = spin.nick;
    ctx.overlay.classList.remove("safe", "drink", "soplica");
    if (spin.kind === "allin") {
      title.textContent = t("spin.chamber");
      hint.textContent = "";
      const verdict = () => {
        if (ctx.shownSpin !== spin.id) return;
        if (spin.outcome === "soplica") {
          ctx.overlay.classList.add("soplica");
          title.textContent = t("spin.soplica");
          hint.textContent = t("spin.safe");
        } else {
          ctx.overlay.classList.add("drink");
          title.textContent = t("spin.drink");
          hint.innerHTML = glassesHtml(spin.drinks, 6);
        }
        if (window.gsap) {
          gsap.from(copy, { y: 18, autoAlpha: 0, duration: motion(0.4), clearProps: "transform,opacity,visibility" });
        }
      };
      if (window.gsap && !ctx.reduceMotion) {
        if (ctx.verdictTw) ctx.verdictTw.kill();
        ctx.verdictTw = gsap.delayedCall(0.9, verdict);
      } else {
        verdict();
      }
      return;
    }
    if (spin.outcome === "soplica") {
      ctx.overlay.classList.add("soplica");
      title.textContent = t("spin.soplica");
      hint.textContent = t("spin.safe");
    } else if (spin.outcome === "drink") {
      ctx.overlay.classList.add("drink");
      title.textContent = t("spin.drink");
      hint.innerHTML = glassesHtml(spin.drinks, 6);
    } else {
      ctx.overlay.classList.add("safe");
      title.textContent = t("spin.safe");
      hint.textContent = t("spin.safePct", {
        pct: Math.round(((spin.chambers - spin.loaded) / spin.chambers) * 100),
      });
    }
    if (window.gsap) {
      gsap.from(copy, { y: 18, autoAlpha: 0, duration: motion(0.4), clearProps: "transform,opacity,visibility" });
    }
  }

  function syncRoulette() {
    const spin = ctx.state && ctx.state.roulette;
    if (!spin) {
      if (ctx.spinTl) {
        ctx.spinTl.kill();
        ctx.spinTl = null;
      }
      if (ctx.verdictTw) {
        ctx.verdictTw.kill();
        ctx.verdictTw = null;
      }
      ctx.overlay.hidden = true;
      ctx.overlay.innerHTML = "";
      ctx.shownSpin = null;
      return;
    }
    if (ctx.shownSpin === spin.id) return;
    ctx.shownSpin = spin.id;
    drawWheel(spin);
    const wheel = ctx.overlay.querySelector(".wheel");
    const wrap = ctx.overlay.querySelector(".wheel-wrap");
    if (ctx.spinTl) ctx.spinTl.kill();
    const spinSeconds = motion(3.1);
    playSpinSounds(Math.max(spinSeconds, 0.05) * 1000, spin);
    if (!window.gsap) {
      wheel.style.transform = `rotate(${finalAngle(spin)}deg)`;
      revealSpin(spin);
      return;
    }
    if (ctx.reduceMotion) {
      gsap.set(wheel, { rotation: finalAngle(spin) });
      revealSpin(spin);
      return;
    }
    gsap.set(wheel, { rotation: 0 });
    ctx.spinTl = gsap.timeline({
      defaults: { ease: "power3.out" },
      onComplete: () => {
        if (ctx.shownSpin === spin.id) revealSpin(spin);
      },
    });
    ctx.spinTl
      .from(wrap, { scale: 0.84, autoAlpha: 0, duration: 0.35 }, 0)
      .to(wheel, { rotation: finalAngle(spin), duration: spinSeconds, ease: "power4.out" }, 0.12);
  }

  function showDock() {
    const dock = document.getElementById("dock");
    if (!dock) return;
    ctx.dockOpen = true;
    dock.hidden = false;
    document.body.classList.add("dock-open");
    if (ctx.dockTl) ctx.dockTl.kill();
    const panel = dock.querySelector(".dock-panel");
    const buttons = dock.querySelectorAll(".act");
    if (!window.gsap || ctx.reduceMotion) return;
    ctx.dockTl = gsap.timeline({ defaults: { ease: "power3.out" } });
    if (panel) {
      gsap.set(panel, { y: 28, autoAlpha: 0 });
      ctx.dockTl.to(panel, { y: 0, autoAlpha: 1, duration: motion(0.42) }, 0);
    }
    if (buttons.length) {
      gsap.set(buttons, { y: 16, autoAlpha: 0, scale: 0.96 });
      ctx.dockTl.to(
        buttons,
        {
          y: 0,
          autoAlpha: 1,
          scale: 1,
          duration: motion(0.38),
          stagger: 0.05,
          ease: "back.out(1.4)",
          clearProps: "transform,opacity,visibility",
        },
        0.08
      );
    }
  }

  function hideDock() {
    const dock = document.getElementById("dock");
    if (!dock) return;
    if (!ctx.dockOpen && dock.hidden) {
      ctx.dockKey = "";
      return;
    }
    ctx.dockOpen = false;
    ctx.dockKey = "";
    document.body.classList.remove("dock-open");
    if (ctx.dockTl) ctx.dockTl.kill();
    const panel = dock.querySelector(".dock-panel");
    const finish = () => {
      dock.hidden = true;
      dock.innerHTML = "";
    };
    if (!window.gsap || ctx.reduceMotion || !panel) {
      finish();
      return;
    }
    ctx.dockTl = gsap.timeline({
      onComplete: finish,
    });
    ctx.dockTl.to(panel, {
      y: 24,
      autoAlpha: 0,
      duration: motion(0.28),
      ease: "power2.in",
    });
  }

  return {
    motion,
    stopPour,
    animateWatch,
    stopRevealCinema,
    updateBoardCount,
    animateRevealSequence,
    animateBoard,
    animate,
    syncRoulette,
    showDock,
    hideDock,
  };
}
