export function wallTime(instant: string, timezone: string) {
 const parts = new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
 const get = (key: string) => parts.find(p=>p.type===key)!.value;
 return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function toInstant(wall: string, timezone: string, occurrence: string) {
 const base = Date.parse(wall+'Z');
 if (!Number.isFinite(base)) throw new Error('Enter a valid date and time');
 const offsets = new Set([-36,0,36].map(h=>{const t=base+h*3600000;return Date.parse(wallTime(new Date(t).toISOString(),timezone)+'Z')-t;}));
 const candidates = [...offsets].map(o=>new Date(base-o).toISOString()).filter(t=>wallTime(t,timezone)===wall).sort();
 if (!candidates.length) throw new Error('This local time does not exist because the clocks change. Choose another time.');
 if(candidates.length>1 && !occurrence) throw new Error('This time occurs twice when the clocks change. Choose the first or second occurrence.');
 return candidates[occurrence==='later' ? candidates.length-1 : 0];
}
