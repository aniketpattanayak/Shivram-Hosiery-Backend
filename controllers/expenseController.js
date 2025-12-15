const Expense = require('../models/Expense');

// @desc    Log a New Expense
// @route   POST /api/sales/expenses
exports.createExpense = async (req, res) => {
  try {
    const { salesPerson, date, category, amount, description } = req.body;

    const count = await Expense.countDocuments();
    const expenseId = `EXP-${String(count + 1).padStart(4, '0')}`;

    const newExpense = await Expense.create({
      expenseId,
      salesPerson,
      date,
      category,
      amount,
      description
    });

    res.status(201).json(newExpense);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Get All Expenses (Sorted by Newest)
// @route   GET /api/sales/expenses
exports.getExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ createdAt: -1 });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Approve or Reject Expense
// @route   PUT /api/sales/expenses/:id/status
exports.updateExpenseStatus = async (req, res) => {
  try {
    const { status, reason } = req.body; // status = 'Approved' or 'Rejected'
    const expense = await Expense.findById(req.params.id);

    if (!expense) return res.status(404).json({ msg: "Expense not found" });

    expense.status = status;
    if (status === 'Rejected') expense.rejectionReason = reason || 'No reason provided';
    
    await expense.save();
    res.json(expense);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};