import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHead } from '../page-head';

/** 1.2: Health (docs/v12-contract.md). Placeholder até a frente de frontend entrar. */
@Component({
  selector: 'pw-page-health',
  imports: [PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<pw-page-head page="health" />`,
})
export class HealthPage {}
