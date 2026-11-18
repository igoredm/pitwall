import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../i18n';
import { ThemeName } from '../models';

/**
 * Miniatura estática do widget num tema (seletor "Tema do widget", assistente e Visão geral). Valores congelados:
 * não assina o snapshot, então 5 miniaturas na tela custam zero CPU. 150×94 com scale 1; a Visão geral usa 2.
 * As medidas e cores são as do canvas 1.0 (tokens de cada tema no escuro).
 */
@Component({
  selector: 'pw-widget-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.--u]': 'scale() === 1 ? null : scale()', class: 'wt-host' },
  template: `
    @let l = labels();
    <span [class]="'wt wt-' + theme()">
      <span class="wt-card wt-gpu">
        <span class="wt-l">{{ l.gpu }}</span>
        <span class="wt-v">97%</span>
        <span class="wt-bar"><i style="width: 97%"></i></span>
        <span class="wt-tiles">
          <span class="wt-tile"><span class="wt-l">{{ l.core }}</span><span class="wt-v">74°</span></span>
          <span class="wt-tile"><span class="wt-l">{{ l.hot }}</span><span class="wt-v">96°</span></span>
        </span>
      </span>
      <span class="wt-mid">
        <span class="wt-fps">144</span>
        <span class="wt-l">{{ l.fps }}</span>
      </span>
      <span class="wt-side">
        <span class="wt-card wt-cpu">
          <span class="wt-l">{{ l.cpu }}</span>
          <span class="wt-v">41%</span>
          <span class="wt-bar"><i style="width: 41%"></i></span>
        </span>
        <span class="wt-card wt-ram">
          <span class="wt-l">{{ l.ram }}</span>
          <span class="wt-bar"><i style="width: 58%"></i></span>
        </span>
      </span>
    </span>
  `,
  styles: `
    :host {
      display: block;
      --u: 1;
      flex-shrink: 0;
    }
    .wt {
      display: flex;
      gap: calc(5px * var(--u));
      width: calc(150px * var(--u));
      height: calc(94px * var(--u));
      box-sizing: border-box;
      padding: calc(6px * var(--u));
      border-radius: calc(6px * var(--u));
      overflow: hidden;
      font-variant-numeric: normal;
      line-height: 1;
      -webkit-font-smoothing: antialiased;
    }
    .wt-card {
      display: flex;
      flex-direction: column;
      gap: calc(3px * var(--u));
      min-width: 0;
      padding: calc(4px * var(--u));
      box-sizing: border-box;
    }
    .wt-gpu {
      flex: 1.35;
    }
    .wt-cpu {
      flex: 1;
    }
    .wt-l {
      font-size: calc(5.2px * var(--u));
      white-space: nowrap;
      line-height: 1;
    }
    .wt-v {
      font-size: calc(8px * var(--u));
      line-height: 1;
    }
    .wt-bar {
      display: block;
      height: calc(2.4px * var(--u));
      border-radius: 9px;
      overflow: hidden;
      background: rgba(127, 127, 127, 0.22);
      i {
        display: block;
        height: 100%;
      }
    }
    .wt-tiles {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: calc(2px * var(--u));
    }
    .wt-tile {
      display: flex;
      flex-direction: column;
      gap: calc(2px * var(--u));
      padding: calc(3px * var(--u));
    }
    .wt-mid {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: calc(3px * var(--u));
    }
    .wt-fps {
      font-size: calc(30px * var(--u));
      letter-spacing: -0.04em;
      line-height: 0.9;
    }
    .wt-side {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: calc(4px * var(--u));
      min-width: 0;
    }

    /* Lumen */
    .wt-lumen {
      background: #0a0d13;
      color: #f4f6fa;
      font-family: 'Nunito', sans-serif;
      .wt-card {
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: calc(7px * var(--u));
      }
      .wt-l {
        color: rgba(228, 233, 242, 0.6);
        font-weight: 700;
      }
      .wt-v {
        font-weight: 300;
      }
      .wt-fps {
        font-weight: 200;
      }
      .wt-bar i {
        background: #4c8dff;
      }
      .wt-tile {
        background: rgba(255, 255, 255, 0.05);
        border-radius: calc(4px * var(--u));
      }
    }

    /* Mínimo */
    .wt-minimo {
      background: #0f0f10;
      color: #ededee;
      font-family: 'Manrope', sans-serif;
      .wt-card,
      .wt-tile {
        border-top: 1px solid #26262a;
      }
      .wt-l {
        color: #9a9a9f;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-weight: 600;
      }
      .wt-v {
        font-weight: 300;
      }
      .wt-fps {
        font-weight: 200;
      }
      .wt-bar {
        height: 1px;
      }
      .wt-bar i {
        background: #ededee;
      }
    }

    /* Neon */
    .wt-neon {
      background-color: #04050b;
      background-image: linear-gradient(rgba(0, 229, 255, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 229, 255, 0.06) 1px, transparent 1px);
      background-size: calc(12px * var(--u)) calc(12px * var(--u));
      color: #e4fbff;
      .wt-card {
        background: rgba(8, 20, 32, 0.7);
        border: 1px solid rgba(0, 229, 255, 0.22);
      }
      .wt-l {
        font-family: 'Rajdhani', sans-serif;
        color: #7fb3c4;
        text-transform: uppercase;
        letter-spacing: 0.2em;
        font-weight: 700;
      }
      .wt-v {
        font-family: 'Orbitron', sans-serif;
        font-weight: 600;
      }
      .wt-tile {
        background: linear-gradient(90deg, rgba(0, 229, 255, 0.1), transparent 70%);
        border-left: 1px solid #00e5ff;
      }
      .wt-fps {
        display: flex;
        align-items: center;
        justify-content: center;
        width: calc(46px * var(--u));
        height: calc(46px * var(--u));
        border-radius: 50%;
        border: 1px solid rgba(0, 229, 255, 0.45);
        font-family: 'Orbitron', sans-serif;
        font-weight: 600;
        font-size: calc(15px * var(--u));
        letter-spacing: 0;
        color: #00e5ff;
      }
      .wt-bar i {
        background: #00e5ff;
      }
    }

    /* Terminal */
    .wt-terminal {
      background: #0b0d0e;
      color: #cfe3d6;
      font-family: 'JetBrains Mono', monospace;
      .wt-card {
        background: #0e1211;
        border: 1px solid #253029;
      }
      .wt-l {
        color: #7d958a;
        font-weight: 500;
      }
      .wt-v {
        font-weight: 500;
      }
      .wt-tile {
        border-top: 1px dashed #253029;
      }
      .wt-fps {
        font-weight: 500;
        font-size: calc(20px * var(--u));
        color: #4af626;
      }
      .wt-bar i {
        background: #4af626;
      }
    }

    /* Splash */
    .wt-splash {
      background: #140a26;
      color: #fff7fb;
      .wt-l {
        font-family: 'Nunito', sans-serif;
        color: rgba(255, 240, 250, 0.72);
        font-weight: 800;
      }
      .wt-v,
      .wt-fps {
        font-family: 'Baloo 2', sans-serif;
        font-weight: 800;
      }
      .wt-fps {
        color: #ffe45c;
      }
      .wt-gpu {
        background: linear-gradient(135deg, #e0206f, #f2580f);
        border-radius: calc(7px * var(--u));
      }
      .wt-cpu {
        background: linear-gradient(135deg, #0077c8, #5b3ff0);
        border-radius: calc(7px * var(--u));
      }
      .wt-ram {
        background: linear-gradient(135deg, #a8eb3a, #2bd3a6);
        color: #0e2418;
      }
      .wt-tile {
        background: rgba(20, 6, 40, 0.22);
        border-radius: calc(5px * var(--u));
      }
      .wt-bar {
        background: rgba(20, 6, 40, 0.3);
      }
      .wt-bar i {
        background: #fff;
      }
    }
  `,
})
export class WidgetThumb {
  private readonly s = inject(I18n).s;
  readonly theme = input<ThemeName>('lumen');
  readonly scale = input(1);

  /** Rótulos como o widget de verdade escreve em cada tema (Terminal em minúsculas, com _). */
  protected readonly labels = computed(() => {
    const s = this.s();
    const core = s.short['gpu.temp'] ?? 'Núcleo';
    const term = this.theme() === 'terminal';
    return {
      gpu: term ? 'gpu' : 'GPU',
      cpu: term ? 'cpu' : 'CPU',
      ram: term ? 'ram' : 'RAM',
      fps: term ? 'fps' : 'FPS',
      core: term ? core.toLowerCase() : core,
      hot: term ? 'hot_spot' : 'Hot spot',
    };
  });
}
