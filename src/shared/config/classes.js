export const CLASS_ARCHETYPES = Object.freeze({
  BRAWLER: Object.freeze({
    id: 'brawler',
    fantasy: 'action-destruction',
    modifiers: Object.freeze({
      meleePercent: 30,
      rangedPercent: -30,
      magicPercent: -30,
      knockbackPercent: 50,
      fallDamagePercent: -20,
      maxHpPercent: 20
    })
  }),
  ARTILLERIST: Object.freeze({
    id: 'artillerist',
    fantasy: 'mastery-strategy',
    modifiers: Object.freeze({
      meleePercent: -10,
      rangedPercent: 30,
      magicPercent: -30,
      counterDamagePercent: 20,
      fallDamagePercent: 10
    })
  }),
  OKKULTIST: Object.freeze({
    id: 'okkultist',
    fantasy: 'immersion-creativity',
    modifiers: Object.freeze({
      meleePercent: -30,
      rangedPercent: -30,
      magicPercent: 30,
      statusEffectPercent: 30,
      fallDamagePercent: 10,
      maxHpPercent: -20
    })
  })
});
