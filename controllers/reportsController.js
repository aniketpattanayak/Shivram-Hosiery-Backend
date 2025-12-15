const Invoice = require('../models/Invoice');
const JobCard = require('../models/JobCard');
const Product = require('../models/Product');
const Material = require('../models/Material');

// @desc    Get Sales Report (Invoices)
exports.getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const query = {};
    if (startDate && endDate) {
      // 🟢 FIX: Set 'end' to the very last millisecond of the day
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      query.createdAt = { 
        $gte: new Date(startDate), 
        $lte: end 
      };
    }

    const invoices = await Invoice.find(query).sort({ createdAt: -1 });
    
    const reportData = invoices.map(inv => ({
      Date: new Date(inv.createdAt).toLocaleDateString(),
      InvoiceNo: inv.invoiceId,
      Customer: inv.customerName,
      Status: inv.status,
      SubTotal: inv.subTotal,
      Tax: inv.taxAmount,
      GrandTotal: inv.grandTotal
    }));

    res.json(reportData);
  } catch (error) {
    console.error("Sales Report Error:", error);
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Get Production Report (Completed Jobs)
exports.getProductionReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { status: 'Completed' }; 
    
    if (startDate && endDate) {
      // 🟢 FIX: Set 'end' to the very last millisecond of the day
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      query.updatedAt = { 
        $gte: new Date(startDate), 
        $lte: end 
      };
    }

    const jobs = await JobCard.find(query);

    const reportData = jobs.map(job => ({
      Date: new Date(job.updatedAt).toLocaleDateString(),
      JobId: job.jobId,
      Product: job.productName,
      BatchSize: job.batchSize,
      Rejected: job.rejectedQty || 0,
      Passed: job.passedQty || job.batchSize, 
      Efficiency: job.rejectedQty ? `${((1 - (job.rejectedQty/job.batchSize))*100).toFixed(1)}%` : '100%'
    }));

    res.json(reportData);
  } catch (error) {
    console.error("Production Report Error:", error);
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Get Current Inventory Value Snapshot
exports.getInventoryReport = async (req, res) => {
  try {
    // 1. Finished Goods
    const products = await Product.find();
    const productData = products.map(p => ({
      Type: 'Finished Good',
      Name: p.name,
      Stock: p.stock?.warehouse || 0,
      UnitPrice: p.sellingPrice || 0,
      TotalValue: (p.stock?.warehouse || 0) * (p.sellingPrice || 0)
    }));

    // 2. Raw Materials
    const materials = await Material.find();
    const materialData = materials.map(m => ({
      Type: 'Raw Material',
      Name: m.name,
      Stock: m.stock?.current || 0,
      UnitPrice: m.costPerUnit || 0,
      TotalValue: (m.stock?.current || 0) * (m.costPerUnit || 0)
    }));

    res.json([...productData, ...materialData]);
  } catch (error) {
    console.error("Inventory Report Error:", error);
    res.status(500).json({ msg: error.message });
  }
};