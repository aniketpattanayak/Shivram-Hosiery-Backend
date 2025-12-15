const Quotation = require('../models/Quotation');
const Client = require('../models/Client');

// @desc    Generate New Quotation
// @route   POST /api/sales/quotes
exports.createQuotation = async (req, res) => {
  try {
    const { clientId, items, terms, salesPerson, subject } = req.body;

    // 1. Fetch Client Details (to freeze them in the quote)
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ msg: "Client not found" });

    // 2. Calculate Totals
    let subTotal = 0;
    let taxAmount = 0;
    
    const processedItems = items.map(item => {
      const lineTotal = Number(item.qty) * Number(item.rate);
      const lineTax = lineTotal * (Number(item.gstPercent) / 100);
      
      subTotal += lineTotal;
      taxAmount += lineTax;

      return {
        ...item,
        amount: lineTotal
      };
    });

    const grandTotal = subTotal + taxAmount;

    // 3. Generate Quote ID (QTN-YEAR-NUMBER)
    const year = new Date().getFullYear();
    const count = await Quotation.countDocuments();
    const quoteId = `QTN-${year}-${String(count + 1).padStart(3, '0')}`;

    // 4. Create Record
    const newQuote = await Quotation.create({
      quoteId,
      client: client._id,
      clientName: client.name,
      clientAddress: client.billToAddress || client.address,
      clientGst: client.gstNumber,
      salesPerson,
      subject,
      validUntil: new Date(Date.now() + 30*24*60*60*1000), // Default 30 days validity
      items: processedItems,
      subTotal,
      taxAmount,
      grandTotal,
      terms
    });

    res.status(201).json(newQuote);

  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Get All Quotations
// @route   GET /api/sales/quotes
exports.getQuotations = async (req, res) => {
  try {
    const quotes = await Quotation.find().sort({ createdAt: -1 });
    res.json(quotes);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Get Single Quote (For Print View)
// @route   GET /api/sales/quotes/:id
exports.getSingleQuotation = async (req, res) => {
  try {
    const quote = await Quotation.findById(req.params.id);
    if(!quote) return res.status(404).json({ msg: "Quotation not found" });
    res.json(quote);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};