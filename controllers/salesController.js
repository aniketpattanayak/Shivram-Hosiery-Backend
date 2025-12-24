const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const ProductionPlan = require('../models/ProductionPlan');
const Client = require('../models/Client'); 
const Lead = require('../models/Lead');     

// ==========================================
// 1. SALES ORDER MANAGEMENT
// ==========================================

exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { 
        customerName, customerId, items, deliveryDate, priority,
        advanceReceived, advanceAmount // 🟢 Capture Advance Info
    } = req.body;
    
    const processedItems = [];
    let isProductionTriggered = false;
    const productionPlansToCreate = [];
    
    let grandTotal = 0;

    for (const item of items) {
      const product = await Product.findOne({ name: item.productName }).session(session);

      if (!product) {
        throw new Error(`Product '${item.productName}' not found in Master.`);
      }

      // --- STOCK LOGIC ---
      const currentWarehouse = product.stock?.warehouse || 0;
      const currentReserved = product.stock?.reserved || 0;
      const availableStock = currentWarehouse - currentReserved;
      
      let allocatedFromStock = 0;
      let sendToProduction = 0;

      if (availableStock >= item.qtyOrdered) {
        allocatedFromStock = item.qtyOrdered;
        sendToProduction = 0;
      } else {
        allocatedFromStock = Math.max(0, availableStock);
        sendToProduction = item.qtyOrdered - allocatedFromStock;
      }

      if (allocatedFromStock > 0) {
        if (!product.stock) product.stock = { warehouse: 0, reserved: 0 };
        product.stock.reserved += allocatedFromStock;
        await product.save({ session });
      }

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

      // FINANCIAL LOGIC
      const finalPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : (product.sellingPrice || 0);
      const lineTotal = finalPrice * Number(item.qtyOrdered);
      grandTotal += lineTotal;

      processedItems.push({
        product: product._id,
        productName: product.name,
        qtyOrdered: item.qtyOrdered,
        qtyAllocated: allocatedFromStock,
        qtyToProduce: sendToProduction,
        unitPrice: finalPrice,
        itemTotal: lineTotal,
        promiseDate: item.promiseDate // 🟢 Save per-item promise date
      });
    }

    const suffix = Math.floor(1000 + Math.random() * 9000);
    const orderId = `ORD-${new Date().getFullYear()}-${suffix}`;

    const newOrder = new Order({
      orderId: orderId,
      customerName: customerName,
      clientId: customerId || null, 
      items: processedItems,
      grandTotal: grandTotal, 
      deliveryDate: deliveryDate,
      priority: priority || 'Medium',
      status: isProductionTriggered ? 'Production_Queued' : 'Ready_Dispatch',
      advanceReceived: advanceReceived || false, // 🟢 Save Advance Info
      advanceAmount: advanceReceived ? (advanceAmount || 0) : 0
    });

    await newOrder.save({ session });

    if (productionPlansToCreate.length > 0) {
      const plans = productionPlansToCreate.map(plan => ({
        ...plan,
        orderId: newOrder._id
      }));
      await ProductionPlan.insertMany(plans, { session });
    }

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

exports.getOrders = async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// ... (Keep the rest of Lead and Client controllers exactly as they were) ...
// ==========================================
// 2. LEAD MANAGEMENT (CRM)
// ==========================================

exports.getLeads = async (req, res) => {
  try {
    let query = {};
    if (req.user && (req.user.role === 'Sales Man' || req.user.role === 'Salesman')) {
        query.salesPerson = req.user.name;
    }
    const leads = await Lead.find(query).sort({ createdAt: -1 });
    res.json(leads);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.createLead = async (req, res) => {
  try {
    const count = await Lead.countDocuments();
    const leadId = `LD-${String(count + 1).padStart(3, '0')}`;
    let salesPersonName = req.body.salesPerson;
    if (req.user && (req.user.role === 'Sales Man' || req.user.role === 'Salesman')) {
        salesPersonName = req.user.name;
    }
    const newLead = await Lead.create({
      ...req.body,
      salesPerson: salesPersonName, 
      leadId,
      activityLog: [{ 
        status: 'New', 
        remarks: 'Lead Created in System', 
        updatedBy: req.user ? req.user.name : 'System' 
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
// 3. CLIENT MASTER
// ==========================================

exports.getClients = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";
    const skip = (page - 1) * limit;
    let query = {};
    if (req.user && (req.user.role === 'Sales Man' || req.user.role === 'Salesman')) {
        query.salesPerson = req.user.name;
    }
    if (search) {
      const searchFilter = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { gstNumber: { $regex: search, $options: "i" } }
        ]
      };
      if (query.salesPerson) {
        query = { $and: [{ salesPerson: query.salesPerson }, searchFilter] };
      } else {
        query = searchFilter;
      }
    }
    const total = await Client.countDocuments(query);
    const clients = await Client.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    res.json({
      data: clients,
      total,
      currentPage: page,
      hasMore: (page * limit) < total
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.createClient = async (req, res) => {
  try {
    let salesPersonName = req.body.salesPerson;
    if (req.user && (req.user.role === 'Sales Man' || req.user.role === 'Salesman')) {
        salesPersonName = req.user.name;
    }
    const newClient = await Client.create({
        ...req.body,
        salesPerson: salesPersonName
    });
    res.status(201).json(newClient);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.updateClient = async (req, res) => {
  try {
    const { 
      name, gstNumber, address, contactPerson, contactNumber, email, paymentTerms, salesPerson, 
      interestedProducts, leadType,
      status, lastActivity 
    } = req.body;
    
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ msg: 'Client not found' });

    const isMasterUpdate = name || gstNumber || address || contactPerson || email || paymentTerms || salesPerson || interestedProducts || leadType;
    const isAdmin = req.user && (req.user.role === 'Admin' || req.user.role === 'Manager');

    if (isMasterUpdate && !isAdmin) {
        return res.status(403).json({ msg: "Access Denied: Only Admins can edit Client Master details." });
    }

    if (isAdmin) {
        if (name) client.name = name;
        if (gstNumber) client.gstNumber = gstNumber;
        if (address) client.address = address;
        if (contactPerson) client.contactPerson = contactPerson;
        if (contactNumber) client.contactNumber = contactNumber;
        if (email) client.email = email;
        if (paymentTerms) client.paymentTerms = paymentTerms;
        if (salesPerson) client.salesPerson = salesPerson;
        if (interestedProducts) client.interestedProducts = interestedProducts;
        if (leadType) client.leadType = leadType;
    }

    if (status || lastActivity) {
      if (status) client.status = status;
      if (!client.activityLog) client.activityLog = [];
      client.activityLog.push({
        updatedBy: req.user.name,
        status: status || client.status,
        type: lastActivity?.type || 'Update',
        remark: lastActivity?.remark || 'Status Updated',
        date: new Date()
      });
    }

    await client.save();
    res.json(client);
  } catch (err) {
    console.error("Update Client Error:", err.message);
    res.status(500).send('Server Error');
  }
};