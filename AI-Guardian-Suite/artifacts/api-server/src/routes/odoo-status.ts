import { Router } from "express";
import { testOdooConnection, loadOdooConfig } from "../lib/odoo-client.js";
import { loadReferenceData, getCache } from "../lib/odoo-reference-data.js";

const router = Router();

// GET /api/odoo/status
router.get("/status", async (req, res) => {
  const cfg = await loadOdooConfig();
  try {
    const result = await testOdooConnection();
    return res.json({
      connected: result.success,
      uid: result.uid,
      company: result.company,
      url: cfg.url,
      db: cfg.db,
    });
  } catch (err) {
    req.log.error({ err }, "Odoo connection test failed");
    return res.json({
      connected: false,
      error: String(err),
      url: cfg.url,
      db: cfg.db,
    });
  }
});

// GET /api/odoo/reference-data
router.get("/reference-data", async (req, res) => {
  try {
    await loadReferenceData();
    const cache = getCache();
    return res.json({
      accounts: cache.accounts?.length ?? 0,
      partners: cache.partners?.length ?? 0,
      taxes: cache.purchaseTaxes?.length ?? 0,
      analyticAccounts: cache.analyticAccounts?.length ?? 0,
      journals: cache.journals?.length ?? 0,
      loadedAt: cache.loadedAt ? new Date(cache.loadedAt).toISOString() : null,
    });
  } catch (err) {
    req.log.error({ err }, "loadReferenceData failed");
    return res.status(500).json({ error: String(err) });
  }
});

// GET /api/odoo/accounts
router.get("/accounts", async (req, res) => {
  try {
    await loadReferenceData();
    const cache = getCache();
    return res.json({
      accounts: (cache.accounts ?? []).map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.account_type,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// GET /api/odoo/partners
router.get("/partners", async (req, res) => {
  try {
    await loadReferenceData();
    const cache = getCache();
    return res.json({
      partners: (cache.partners ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email || null,
        phone: p.phone || null,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
