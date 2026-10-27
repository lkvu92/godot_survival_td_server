// Deterministic catalog mechanical update; no database writes/deployment.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../data');
const itemsPath = path.join(root, 'items.json');
const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
const battle = (kind, value, duration = 30, extra = {}) => ({context:'combat', kind, value, duration, cooldown:15, ...extra});
const effects = {
  exp_talisman: {context:'inventory',kind:'exp',value:10000},
  gold_talisman: {context:'inventory',kind:'gold',value:75000},
  energy_elixir: {context:'inventory',kind:'stamina',value:15},
  attack_talisman:battle('attack',0.3), defense_talisman:battle('defense',0.3),
  cooldown_talisman:battle('cooldown',0.2), resistance_talisman:battle('resistance',0.2),
  critical_talisman:battle('critical',0.1), attack_speed_talisman:battle('attack_speed',0.25),
  revive_talisman:battle('revive',0.5,3), healing_elixir:battle('heal',0.3,0,{cooldown:5}),
  shield_elixir:battle('shield',0.3,15), slow_talisman:battle('slow',0.4,8,{radius:400})
};
for (const element of ['metal','wood','water','fire','earth']) {
  effects[element+'_aptitude_fruit'] = {context:'inventory',kind:'affinity',value:5,element,cap:400};
}
const descriptions = {
  exp_talisman:'Nhận 10.000 EXP tài khoản. Tuân theo giới hạn cấp và cổng Độ Kiếp.',
  gold_talisman:'Nhận 75.000 Vàng.', energy_elixir:'Hồi 15 thể lực, tối đa 30.',
  attack_talisman:'Tăng 30% công kích trong 30 giây.', defense_talisman:'Tăng 30% phòng thủ trong 30 giây.',
  cooldown_talisman:'Giảm 20% hồi chiêu mới trong 30 giây.', resistance_talisman:'Giảm 20% sát thương ngũ hành nhận trong 30 giây.',
  critical_talisman:'Tăng 10 điểm phần trăm chí mạng trong 30 giây.', attack_speed_talisman:'Giảm 25% chu kỳ đánh thường trong 30 giây.',
  revive_talisman:'Hồi sinh với 50% HP và bất tử 3 giây. Tối đa 1 lần mỗi trận thường.',
  healing_elixir:'Hồi ngay 30% HP tối đa trong trận.', shield_elixir:'Tạo khiên bằng 30% HP tối đa trong 15 giây.',
  slow_talisman:'Làm chậm 40% quái trong bán kính 400 trong 8 giây.'
};
for (const item of items) if (effects[item.id]) {
  item.attributes.use_action = 'use_consumable'; item.attributes.effect = effects[item.id];
  if (descriptions[item.id]) item.description = descriptions[item.id];
  else item.description = 'Tăng vĩnh viễn 5 điểm tư chất hệ tương ứng, giới hạn nhận thêm đến 400. Giữ nguyên khi tẩy thiên phú.';
}
fs.writeFileSync(itemsPath, JSON.stringify(items,null,2)+'\n');
const progressionPath = path.join(root,'progression.json');
const progression = JSON.parse(fs.readFileSync(progressionPath,'utf8'));
progression.consumables = {version:1,reroll:{main_growth:3,secondary_growth:2}};
fs.writeFileSync(progressionPath, JSON.stringify(progression,null,2)+'\n');
