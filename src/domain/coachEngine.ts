import type { MonthSummary } from './types';

export interface CoachAdvice {
  tone: 'success' | 'warning' | 'info';
  title: string;
  message: string;
}

export interface CoachProvider {
  getAdvice(summary: MonthSummary): CoachAdvice[];
}

export class RuleBasedCoach implements CoachProvider {
  getAdvice(summary: MonthSummary): CoachAdvice[] {
    const advice: CoachAdvice[] = [];
    if (summary.daysLeft === 0 && summary.monthProgress >= 100) {
      advice.push({ tone: 'info', title: 'Ay tamamlandı', message: 'Bu dönem kapanmış durumda. Sinyaller ayın gerçekleşen sonuçlarını gösteriyor.' });
    } else if (summary.budgetConsumptionRate > summary.monthProgress + 12) {
      advice.push({ tone: 'warning', title: 'Tempo yükseldi', message: 'Bütçen takvimden hızlı ilerliyor. Bugün isteğe bağlı harcamaları ertele.' });
    } else {
      advice.push({ tone: 'success', title: 'Ritmin dengeli', message: 'Bütçe tüketimin zaman planınla uyumlu. Günlük güvenli sınırını koru.' });
    }
    if (summary.unplannedRatio > 20) {
      advice.push({ tone: 'warning', title: 'Plansız harcama sinyali', message: `Değişken harcamalarının %${Math.round(summary.unplannedRatio)} kadarı plansız. Bir sonraki satın almayı 24 saat beklet.` });
    }
    if (summary.investmentPlanRealizationRate >= 100) {
      advice.push({ tone: 'success', title: 'Gelecek finanse edildi', message: 'Bu ayın yatırım planı tamamlandı. Yatırım paran günlük bütçeden ayrı ve güvende.' });
    } else {
      advice.push({ tone: 'info', title: 'Yatırım planı açık', message: `Aylık yatırım planının %${Math.round(summary.investmentPlanRealizationRate)} kadarı gerçekleşti.` });
    }
    return advice;
  }
}

export const coachProvider: CoachProvider = new RuleBasedCoach();
