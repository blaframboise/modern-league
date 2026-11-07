import type { ExtractionReport } from '../extraction/index.ts';
import type { ImportValues } from '../results/index.ts';
import { parseExtraction } from '../extraction/index.ts';
import { unresolvedOriginal } from './validation.ts';

/** Convert unverified vision suggestions into editable domain values, never identities. */
export function suggestedImportValues(input: unknown, sourceId: string): ImportValues {
  const report: ExtractionReport = parseExtraction(input,[sourceId]);
  if (report.fictional) throw new Error('Fictional extraction cannot enter an official draft.');
  const t = report.tournament;
  const str = (key: keyof typeof t): string => typeof t[key].value === 'string' ? t[key].value as string : '';
  const num = (key: keyof typeof t): number | null => typeof t[key].value === 'number' ? t[key].value as number : null;
  const baseline = unresolvedOriginal();
  const time = str('time'), date = str('date'), zone = str('timeZone');
  const start = date && time && zone ? {date,time,timeZone:zone,...(str('offset')?{offset:str('offset')}:{})} : null;
  const kind = str('kind') as ImportValues['tournament']['kind'];
  return {
    tournament: {
      ...baseline.tournament, eventId:str('eventId'),sourceKey:str('sourceKey'),name:str('name'),
      date,year:num('year') ?? 0,kind,start,scheduledRounds:num('scheduledRounds'),
      ...(str('seasonId')?{seasonId:str('seasonId')}:{})
    },
    results: report.results.map((row,index)=>({
      rowId:`suggestion-${index+1}`,
      importedName: typeof row.fields.importedName.value === 'string' ? row.fields.importedName.value : '',
      playerId:null,
      wins: typeof row.fields.wins.value === 'number' ? row.fields.wins.value : null,
      losses: typeof row.fields.losses.value === 'number' ? row.fields.losses.value : null,
      draws: typeof row.fields.draws.value === 'number' ? row.fields.draws.value : null,
      finalPosition: typeof row.fields.finalPosition.value === 'number' ? row.fields.finalPosition.value : null,
    })),
  };
}
