// Generate a targeted catalog patch only. Does not modify player data or old POs.
const fs = require('fs'), path = require('path');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/packs.json'), 'utf8'));
const packs = catalog.packs_by_tab.daily;
const products = packs.concat(catalog.packs_by_tab.resources.filter(p => p.product_id === 'gold_vault'));
const quote = v => "'" + String(v).replace(/'/g, "''") + "'";
const json = v => quote(JSON.stringify(v)) + '::jsonb';
if (packs.length !== 2 || !packs.every(p => ['daily_deal','flash_sale'].includes(p.product_id) && p.duration_days === 30 && p.rewards.some(r => r.metadata && r.metadata.daily_pack_days === 30))) throw Error('Invalid monthly daily-pack catalog');
let sql = '-- C173 v1.2.0: deploy runtime before applying; publish immutable config afterward.\nBEGIN;\nLOCK TABLE game_store_products, game_store_product_rewards IN SHARE ROW EXCLUSIVE MODE;\n';
sql += "DO $check$ BEGIN IF (SELECT COUNT(*) FROM game_store_products WHERE product_id IN ('daily_deal','flash_sale','gold_vault')) <> 3 THEN RAISE EXCEPTION 'All three package products must already exist'; END IF; IF (SELECT COUNT(*) FROM game_items WHERE id IN ('talisman_enhance_charm','element_enlightenment_charm','exp_boost_card_10','campaign_sweep_ticket')) <> 4 THEN RAISE EXCEPTION 'Required reward items missing'; END IF; END; $check$;\n";
for (const p of products) {
  sql += `UPDATE game_store_products SET description=${quote(p.desc)},badge=${quote(p.badge)},purchase_limit=0,purchase_limit_period='',unique_purchase=FALSE,ui=COALESCE(ui,'{}'::jsonb)||${json(p)},updated_at=NOW() WHERE product_id=${quote(p.product_id)};\n`;
  sql += `DELETE FROM game_store_product_rewards WHERE product_id=${quote(p.product_id)};\n`;
  p.rewards.forEach((r,i) => { sql += `INSERT INTO game_store_product_rewards(product_id,line_no,reward_type,reward_id,quantity,metadata) VALUES(${quote(p.product_id)},${i+1},${quote(r.reward_type)},${quote(r.reward_id)},${r.quantity},${json(r.metadata)});\n`; });
}
sql += 'COMMIT;\n';
if (require.main === module) process.stdout.write(sql);
module.exports = {sql, packs, products};
