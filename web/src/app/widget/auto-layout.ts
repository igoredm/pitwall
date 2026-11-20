/** Layouts do widget, sem o "auto" (que vira um destes pelo tamanho da janela). */
export type LayoutSize = 'full' | 'mid' | 'compact' | 'strip' | 'mini';

/**
 * Layout automático pelo tamanho da janela (px lógicos). Pura, sem DOM (testada em auto-layout.spec.ts).
 *
 * 1. compacto: retângulo pequenininho (< 340 × 260), como sempre;
 * 2. strip (faixa): proporção ≥ 3:1 com pelo menos 1600 px de largura (Xeneon Edge 2560×720, 1920×480), ou
 *    proporção ≥ 3,6:1 em qualquer largura. 1280×400 (3,2:1), a referência do completo, continua no completo;
 * 3. mini (telinha 5"/7"): até 1024 × 600, deitada (proporção de 1,25:1 a 3:1) e com pelo menos 300 px de altura
 *    (800×480, 1024×600, 480×320). Quadrados e colunas pequenas (300×300) e faixas baixas (480×220) ficam no médio;
 * 4. médio: < 640 × 640; 5. completo: o resto (horizontal ou vertical).
 */
export function autoLayout(w: number, h: number): LayoutSize {
  if (!(w > 0) || !(h > 0)) return 'full';
  if (w < 340 && h < 260) return 'compact';
  const r = w / h;
  if ((r >= 3 && w >= 1600) || r >= 3.6) return 'strip';
  if (w <= 1024 && h <= 600 && h >= 300 && r >= 1.25 && r < 3) return 'mini';
  if (w < 640 && h < 640) return 'mid';
  return 'full';
}
