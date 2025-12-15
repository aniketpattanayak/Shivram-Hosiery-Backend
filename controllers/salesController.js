const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const ProductionPlan = require('../models/ProductionPlan');
const Client = require('../models/Client'); // 🟢 Added
const Lead = require('../models/Lead');     // 🟢 Added

// ==========================================
// 1. SALES ORDER MANAGEMENT (Your Existing Logic)
// ==========================================

// @desc    Create New Sales Order (Smart Allocate)
// @route   POST /api/sales/orders
exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Get Data
    const { customerName, items, deliveryDate, priority } = req.body;
    
    const processedItems = [];
    let isProductionTriggered = false;
    const productionPlansToCreate = [];

    // 2. Loop through every item
    for (const item of items) {
      const product = await Product.findOne({ name: item.productName }).session(session);

      if (!product) {
        throw new Error(`Product '${item.productName}' not found in Master.`);
      }

      // Safe access to stock
      const currentWarehouse = product.stock?.warehouse || 0;
      const currentReserved = product.stock?.reserved || 0;
      const availableStock = currentWarehouse - currentReserved;
      
      let allocatedFromStock = 0;
      let sendToProduction = 0;

      if (availableStock >= item.qtyOrdered) {
        // We have it all!
        allocatedFromStock = item.qtyOrdered;
        sendToProduction = 0;
      } else {
        // Partial or None
        allocatedFromStock = Math.max(0, availableStock);
        sendToProduction = item.qtyOrdered - allocatedFromStock;
      }

      // 3. Update Inventory
      if (allocatedFromStock > 0) {
        if (!product.stock) product.stock = { warehouse: 0, reserved: 0 };
        product.stock.reserved += allocatedFromStock;
        await product.save({ session });
      }

      // 4. Prepare Production Plan
      if (sendToProduction > 0) {
        isProductionTriggered = true;
        const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
        
        productionPlansToCreate.push({
          planId: `PP-${Date.now()}-${uniqueSuffix}`, 
          product: product._id, 
          totalQtyToMake: sendToProduction,
          status: 'Pending Strategy', 
          splits: [] 
        });
      }

      processedItems.push({
        product: product._id,
        productName: product.name,
        qtyOrdered: item.qtyOrdered,
        qtyAllocated: allocatedFromStock,
        qtyToProduce: sendToProduction
      });
    }

    // 5. Create Order
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const orderId = `ORD-${new Date().getFullYear()}-${suffix}`;

    const newOrder = new Order({
      orderId: orderId,
      customerName: customerName,
      items: processedItems,
      deliveryDate: deliveryDate,
      priority: priority || 'Medium',
      status: isProductionTriggered ? 'Production_Queued' : 'Ready_Dispatch'
    });

    await newOrder.save({ session });

    // 6. Save Plans
    if (productionPlansToCreate.length > 0) {
      const plans = productionPlansToCreate.map(plan => ({
        ...plan,
        orderId: newOrder._id
      }));
      await ProductionPlan.insertMany(plans, { session });
    }

    // 7. Commit
    await session.commitTransaction();

    res.status(201).json({ success: true, msg: 'Order processed', order: newOrder });

  } catch (error) {
    await session.abortTransaction();
    console.error("Create Order Error:", error);
    res.status(500).json({ success: false, msg: error.message });
  } finally {
    session.endSession();
  }
};

// @desc    Get All Orders
// @route   GET /api/sales/orders
exports.getOrders = async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// ==========================================
// 2. LEAD MANAGEMENT (CRM) - 🟢 NEW
// ==========================================

exports.getLeads = async (req, res) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });
    res.json(leads);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.createLead = async (req, res) => {
  try {
    const count = await Lead.countDocuments();
    const leadId = `LD-${String(count + 1).padStart(3, '0')}`;

    const newLead = await Lead.create({
      ...req.body,
      leadId,
      activityLog: [{ 
        status: 'New', 
        remarks: 'Lead Created in System', 
        updatedBy: req.body.salesPerson 
      }]
    });
    
    res.status(201).json(newLead);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.updateLeadActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks, updatedBy } = req.body;

    const lead = await Lead.findById(id);
    if (!lead) return res.status(404).json({ msg: "Lead not found" });

    lead.status = status;
    lead.activityLog.push({ status, remarks, updatedBy, date: new Date() });

    await lead.save();
    res.json(lead);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// ==========================================
// 3. CLIENT MASTER - 🟢 NEW
// ==========================================

exports.getClients = async (req, res) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    res.json(clients);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.createClient = async (req, res) => {
  try {
    const newClient = await Client.create(req.body);
    res.status(201).json(newClient);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};