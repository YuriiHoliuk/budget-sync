import {
  test,
  expect,
  SettingsPage,
  createCategorizationRule,
} from '../../fixtures/index.ts';

test.describe('Rules Management', () => {
  test('should create a categorization rule', async ({ authenticatedPage }) => {
    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.goto();
    await settingsPage.waitForLoad();

    const ruleText = `Assign Bolt to Transport > Taxi ${Date.now()}`;

    await settingsPage.createRule('categorization', ruleText, 10);
    await authenticatedPage.waitForLoadState('networkidle');

    await settingsPage.assertRuleExists('categorization', ruleText);
  });

  test('should edit a categorization rule', async ({ authenticatedPage }) => {
    const rule = await createCategorizationRule({
      rule: `Edit test rule ${Date.now()}`,
      priority: 5,
    });

    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.goto();
    await settingsPage.waitForLoad();

    await settingsPage.assertRuleExists('categorization', rule.rule);

    const updatedText = `Updated rule ${Date.now()}`;
    await settingsPage.editRule('categorization', rule.rule, updatedText, 20);
    await authenticatedPage.waitForLoadState('networkidle');

    await settingsPage.assertRuleExists('categorization', updatedText);
    await settingsPage.assertRuleNotExists('categorization', rule.rule);
  });

  test('should delete a categorization rule', async ({ authenticatedPage }) => {
    const rule = await createCategorizationRule({
      rule: `Delete test rule ${Date.now()}`,
      priority: 3,
    });

    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.goto();
    await settingsPage.waitForLoad();

    await settingsPage.assertRuleExists('categorization', rule.rule);

    await settingsPage.deleteRule('categorization', rule.rule);
    await authenticatedPage.waitForLoadState('networkidle');

    await settingsPage.assertRuleNotExists('categorization', rule.rule);
  });

  test('should create a budgetization rule', async ({ authenticatedPage }) => {
    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.goto();
    await settingsPage.waitForLoad();

    const ruleText = `Assign Transport category to Transport budget ${Date.now()}`;

    await settingsPage.createRule('budgetization', ruleText, 5);
    await authenticatedPage.waitForLoadState('networkidle');

    await settingsPage.assertRuleExists('budgetization', ruleText);
  });

  test('should cancel rule creation without saving', async ({ authenticatedPage }) => {
    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.goto();
    await settingsPage.waitForLoad();

    const initialCount = await settingsPage.getRuleCount('categorization');

    const sheet = await settingsPage.openCreateRuleSheet('categorization');
    await sheet.fillInput('input-rule-text', 'This rule should not be saved');
    await sheet.clickButton('btn-rule-cancel');
    await sheet.waitForClose();

    const afterCount = await settingsPage.getRuleCount('categorization');
    expect(afterCount).toBe(initialCount);
  });

  test('should show seeded rules on page load', async ({ authenticatedPage }) => {
    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.goto();
    await settingsPage.waitForLoad();

    // Seed data should populate both sections
    const catCount = await settingsPage.getRuleCount('categorization');
    const budCount = await settingsPage.getRuleCount('budgetization');

    expect(catCount).toBeGreaterThan(0);
    expect(budCount).toBeGreaterThan(0);
  });
});
