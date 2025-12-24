const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const ProductionPlan = require('../models/ProductionPlan');
const Client = require('../models/Client'); 
const Lead = require('../models/Lead');
// 🟢 Ensure this matches your actual filename (Quote.js or Quotation.js)
const Quote = require('../models/Quotation'); 

// ==========================================
// 1. QUOTATION MANAGEMENT (🟢 FIXED & MERGED)
// ==========================================

exports.createQuote = async (req, res) => {
  try {
    const { 
      clientId, clientName, clientAddress, clientGst, 
      subject, items, terms 
    } = req.body;

    let { salesPerson } = req.body;

    // 🟢 1. STRICT OWNERSHIP: Force Salesman Name
    if (req.user.role === 'Sales Man' || req.user.role === 'Salesman') {
        salesPerson = req.user.name;
    } else if (!salesPerson) {
        salesPerson = req.user.name; 
    }

    // 🟢 2. CRITICAL FIX: Sanitize clientId (Convert "" to null)
    let finalClientId = (clientId && mongoose.Types.ObjectId.isValid(clientId)) ? clientId : null;

    // 🟢 3. HYBRID CLIENT LOGIC: Find or Create Client
    if (!finalClientId && clientName) {
        // Check if client exists by name to avoid duplicates
        const existingClient = await Client.findOne({ name: { $regex: new RegExp(`^${clientName}$`, "i") } });
        
        if (existingClient) {
            finalClientId = existingClient._id;
        } else {
            // Create New Client in Master automatically
            const newClient = await Client.create({
                name: clientName,
                address: clientAddress,
                billToAddress: clientAddress, 
                gstNumber: clientGst,
                salesPerson: salesPerson,
                status: 'Interested', 
                leadType: 'Medium'
            });
            finalClientId = newClient._id;
        }
    }

    // 4. Calculate Totals
    let subTotal = 0;
    let taxAmount = 0;
    
    // Process items to ensure numbers
    const processedItems = items.map(item => {
      const lineTotal = Number(item.qty) * Number(item.rate);
      // If you have a gstPercent field on items, calculate tax here
      const lineTax = lineTotal * ((Number(item.gstPercent) || 0) / 100);
      
      subTotal += lineTotal;
      taxAmount += lineTax;

      return {
        ...item,
        amount: lineTotal
      };
    });

    const grandTotal = subTotal + taxAmount;

    // 5. Generate Quote ID
    const year = new Date().getFullYear();
    const count = await Quote.countDocuments();
    const quoteId = `QTN-${year}-${String(count + 1).padStart(3, '0')}`;

    // 6. Save Quote
    const newQuote = await Quote.create({
        quoteId,
        client: finalClientId, // 🟢 Now safely an ObjectId or null
        clientName,
        clientAddress,
        clientGst,
        salesPerson,
        subject,
        validUntil: new Date(Date.now() + 30*24*60*60*1000),
        items: processedItems,
        terms,
        subTotal,
        taxAmount,
        grandTotal,
        status: 'Draft'
    });

    res.status(201).json(newQuote);

  } catch (error) {
    console.error("Create Quote Error:", error);
    res.status(500).json({ msg: error.message });
  }
};

exports.getQuotes = async (req, res) => {
    try {
        let query = {};
        // 🟢 VIEW FILTER: Salesman sees only their own quotes
        if (req.user.role === 'Sales Man' || req.user.role === 'Salesman') {
            query.salesPerson = req.user.name;
        }
        const quotes = await Quote.find(query).sort({ createdAt: -1 });
        res.json(quotes);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

exports.getSingleQuotation = async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if(!quote) return res.status(404).json({ msg: "Quotation not found" });

    // Security Check
    const isSalesMan = (req.user.role === 'Sales Man' || req.user.role === 'Salesman');
    if (isSalesMan && quote.salesPerson !== req.user.name) {
        return res.status(403).json({ msg: "Access Denied" });
    }
    res.json(quote);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// ==========================================
// 2. SALES ORDER MANAGEMENT (🟢 FIXED CAST ERROR)
// ==========================================

exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { 
        customerName, customerId, items, deliveryDate, priority,
        advanceReceived, advanceAmount 
    } = req.body;
    
    let finalCustomerId = (customerId && mongoose.Types.ObjectId.isValid(customerId)) ? customerId : null;

    if (!finalCustomerId && customerName) {
         const existing = await Client.findOne({ name: { $regex: new RegExp(`^${customerName}$`, "i") } }).session(session);
         if (existing) {
             finalCustomerId = existing._id;
         } else {
             const newC = new Client({
                 name: customerName,
                 salesPerson: req.user ? req.user.name : 'Admin',
                 status: 'Customer',
                 leadType: 'Medium'
             });
             await newC.save({ session });
             finalCustomerId = newC._id;
         }
    }

    const processedItems = [];
    let isProductionTriggered = false;
    const productionPlansToCreate = [];
    let grandTotal = 0;

    for (const item of items) {
      const product = await Product.findOne({ name: item.productName }).session(session);
      
      // 🟢 CHANGE: We no longer check availableStock or Reserve it.
      // We assume FULL production is needed initially.
      // Dispatching from stock later will reduce this demand.
      
      const fullQty = Number(item.qtyOrdered); 

      if (product) {
        isProductionTriggered = true; // Always queue for production tracking
        const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
        
        productionPlansToCreate.push({
          planId: `PP-${Date.now()}-${uniqueSuffix}`, 
          product: product._id, 
          totalQtyToMake: fullQty, // Ask for the full amount
          dispatchedQty: 0,        // Start with 0 dispatched
          status: 'Pending Strategy', 
          splits: [] 
        });
      }

      const finalPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : (product?.sellingPrice || 0);
      const lineTotal = finalPrice * fullQty;
      grandTotal += lineTotal;

      processedItems.push({
        product: product ? product._id : null,
        productName: item.productName,
        qtyOrdered: fullQty,
        qtyAllocated: 0, // 🟢 Always 0 at start (No auto-reservation)
        qtyToProduce: fullQty,
        unitPrice: finalPrice,
        itemTotal: lineTotal,
        promiseDate: item.promiseDate 
      });
    }

    const suffix = Math.floor(1000 + Math.random() * 9000);
    const orderId = `ORD-${new Date().getFullYear()}-${suffix}`;

    const newOrder = new Order({
      orderId: orderId,
      customerName: customerName,
      clientId: finalCustomerId, 
      items: processedItems,
      grandTotal: grandTotal, 
      deliveryDate: deliveryDate,
      priority: priority || 'Medium',
      status: 'Production_Queued', // Always Queued now
      advanceReceived: advanceReceived || false, 
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
    res.status(201).json({ success: true, msg: 'Order Created. Production Plan Generated (Full Qty).', order: newOrder });

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

// ==========================================
// 3. LEAD MANAGEMENT
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
      activityLog: [{ status: 'New', remarks: 'Lead Created', updatedBy: req.user ? req.user.name : 'System' }]
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
// 4. CLIENT MASTER
// ==========================================

exports.getClients = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";
    const skip = (page - 1) * limit;
    let query = {};
    
    // View Restriction
    if (req.user && (req.user.role === 'Sales Man' || req.user.role === 'Salesman')) {
        query.salesPerson = req.user.name;
    }
    
    // Search
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
    const clients = await Client.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    
    res.json({ data: clients, total, currentPage: page, hasMore: (page * limit) < total });
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
    const newClient = await Client.create({ ...req.body, salesPerson: salesPersonName });
    res.status(201).json(newClient);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.updateClient = async (req, res) => {
  try {
    const { 
        name, gstNumber, address, contactPerson, contactNumber, email, paymentTerms, salesPerson, 
        interestedProducts, leadType, status, lastActivity 
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
    res.status(500).send('Server Error');
  }
};

exports.getSingleQuotation = async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if(!quote) return res.status(404).json({ msg: "Quotation not found" });

    // Security: Restrict Salesmen to their own quotes
    const isSalesMan = (req.user.role === 'Sales Man' || req.user.role === 'Salesman');
    if (isSalesMan && quote.salesPerson !== req.user.name) {
        return res.status(403).json({ msg: "Access Denied" });
    }

    res.json(quote);
  } catch (error) {
    console.error("Get Single Quote Error:", error);
    res.status(500).json({ msg: error.message });
  }
};
