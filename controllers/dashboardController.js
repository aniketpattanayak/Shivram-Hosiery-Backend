const Order = require("../models/Order");
const Product = require("../models/Product");
const Material = require("../models/Material");
const JobCard = require("../models/JobCard");
const Invoice = require("../models/Invoice"); // 🟢 Import Invoice

exports.getStats = async (req, res) => {
  try {
    const [
      pendingOrders,
      activeJobs,
      lowStockMaterials,
      products,
      recentOrders,
      revenueResult, // 🟢 New Result
    ] = await Promise.all([
      Order.countDocuments({ status: { $ne: "Dispatched" } }),
      JobCard.countDocuments({ status: "In_Progress" }),
      Material.find({ "stock.current": { $lt: 100 } })
        .limit(5)
        .select("name stock unit"),
      Product.find().select("stock sellingPrice"),
      Order.find()
        .sort({ createdAt: -1 })
        .limit(3)
        .select("orderId customerName status createdAt"),

      // 🟢 F. Revenue: Sum of all 'Paid' or 'Unpaid' invoices (Total Sales)
      Invoice.aggregate([
        { $group: { _id: null, total: { $sum: "$grandTotal" } } },
      ]),
    ]);

    const inventoryValue = products.reduce((acc, item) => {
      return acc + (item.stock?.warehouse || 0) * (item.sellingPrice || 0);
    }, 0);

    // Extract revenue safely
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    res.json({
      metrics: {
        pendingOrders,
        activeJobs,
        inventoryValue,
        totalRevenue, // 🟢 Send to frontend
        lowStockCount: lowStockMaterials.length,
      },
      lowStockMaterials: lowStockMaterials.map((m) => ({
        name: m.name,
        current: m.stock.current,
        unit: m.unit,
      })),
      recentActivity: recentOrders.map((o) => ({
        action: "New Order",
        desc: `${o.orderId} - ${o.customerName}`,
        time: new Date(o.createdAt).toLocaleDateString(),
      })),
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({ msg: error.message });
  }
};
