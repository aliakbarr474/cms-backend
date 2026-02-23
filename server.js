require('dotenv').config();
const express = require("express");
const cors = require("cors");
const http = require('http');
const { Server } = require("socket.io");
let mysql = require('mysql2');
const { Socket } = require("dgram");
const { urlToHttpOptions } = require("url");
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "1234",
  database: process.env.DB_NAME || "project",
  port: process.env.DB_PORT || 3306
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    return;
  }
  console.log("Connected to MySQL database.");
});

PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ["GET", "POST"]
  }
})

app.set('io', io);

io.on('connection', (socket) => {
  console.log('Client connected: ', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected: ', socket.id);
  });
});

io.on('connection', socket => {
  socket.on('join-project-ledger', projectId => {
    socket.join(`project-${projectId}`)
  })
})

io.on('connection', (socket) => {
  socket.on('join-vendor-ledger', vendorId => {
    socket.join(`vendor-${vendorId}`);
  });

  socket.on('disconnect', () => {});
});


app.post('/signup', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username or Password missing' });
  }

  const sql = 'INSERT INTO users (username,password) VALUES (?,?)';
  db.query(sql, [username, password], (err, result) => {
    if (err) {
      console.log('Error inserting data: ', err);
      return res.status(500).json({ message: 'Database error' });
    }

    return res.status(200).json({ message: 'User Registered Successfully' });
  })
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username or Password missing' });
  }

  const sql = 'SELECT username FROM users WHERE username = ? AND password = ?'
  db.query(sql, [username, password], (err, result) => {
    if (err) {
      console.log('Error inserting data: ', err);
      return res.status(500).json({ message: 'Database error' });
    }

    if (result.length === 0) {
      return res.status(400).json({ message: 'User not found' });
    } else {
      const user = result[0].username;
      const token = jwt.sign(
        { id: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      )

      return res.status(200).json({
        message: 'Login Successful',
        username: user,
        token: token
      });
    }
  })
});

app.post('/clients/add', (req, res) => {
  const { client, clientPhone } = req.body;

  if (!client) {
    return res.status(400).json({ message: 'Client name missing' })
  }

  const sql = 'INSERT INTO clients (client_name,phone) VALUES (?,?)'
  db.query(sql, [client, clientPhone], (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }

    return res.status(200).json({
      message: 'Labor added successfully',
      insertId: result.insertId,
      client_name: client,
      phone: clientPhone,
    });
  })
})


app.get('/clients/show', (req, res) => {
  const sql = 'SELECT * FROM clients'
  db.query(sql, (err, result) => {
    if (err) {
      console.log('Error retreiving data');
      return res.status(400).json({ message: 'Database Error' });
    }

    return res.status(200).json(result);
  })
})

app.delete('/clients/delete/:id', (req, res) => {
  const { id } = req.params;

  const getProjectsSql = `
    SELECT project_id FROM projects WHERE client_id = ?
  `;

  db.query(getProjectsSql, [id], (err1, projects) => {
    if (err1) {
      console.error(err1);
      return res.status(500).json({ message: 'Failed to fetch projects' });
    }

    const projectIds = projects.map(p => p.project_id);

    const deleteClient = () => {
      db.query(
        'DELETE FROM clients WHERE client_id = ?',
        [id],
        (errFinal, result) => {
          if (errFinal) {
            console.error(errFinal);
            return res.status(500).json({ message: 'Client delete failed' });
          }

          if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Client not found' });
          }

          return res.status(200).json({ message: 'Client deleted successfully' });
        }
      );
    };

    if (projectIds.length === 0) {
      return deleteClient();
    }

    const placeholders = projectIds.map(() => '?').join(',');

    const deleteQueries = [
      `DELETE FROM project_ledger WHERE project_id IN (${placeholders})`,
      `DELETE FROM payments WHERE project_id IN (${placeholders})`,
      `DELETE FROM expenses WHERE project_id IN (${placeholders})`,
      `DELETE FROM project_vendors WHERE project_id IN (${placeholders})`,
      `DELETE FROM projects WHERE project_id IN (${placeholders})`
    ];

    const runDeletes = (index) => {
      if (index === deleteQueries.length) {
        return deleteClient();
      }

      db.query(deleteQueries[index], projectIds, (errStep) => {
        if (errStep) {
          console.error(errStep);
          return res.status(500).json({ message: 'Failed to delete related data' });
        }
        runDeletes(index + 1);
      });
    };

    runDeletes(0);
  });
});


app.post('/labor/add', (req, res) => {
  const { labor, salary } = req.body;

  if (!labor) {
    return res.status(400).json({ message: 'Labor name missing' })
  }

  const sql = 'INSERT INTO labor (labor_name,salary) VALUES (?,?)'
  db.query(sql, [labor, salary], (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }

    return res.status(200).json({
      message: 'Labor added successfully',
      insertId: result.insertId,
      labor_name: labor,
      salary: salary,
    });
  })
})

app.get('/labor/show', (req, res) => {
  const sql = 'SELECT * FROM labor'
  db.query(sql, (err, result) => {
    if (err) {
      console.log('Error retreiving data');
      return res.status(400).json({ message: 'Database Error' });
    }

    return res.status(200).json(result);
  })
})

app.delete('/labor/delete/:id', (req, res) => {
  const { id } = req.params;

  const sql = 'DELETE FROM labor WHERE labor_id = ?'
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.log('Error deleting data');
      return res.status(400).json({ message: 'Database Error' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Labor not found' });
    }

    return res.status(200).json({ message: 'Labor deleted successfully' });
  })

})

app.post('/vendors/add', (req, res) => {
  const { vendor, vendorPhone, openingBalance } = req.body;

  if (!vendor) {
    return res.status(400).json({ message: 'Vendor name missing' });
  }

  const opening = Number(openingBalance);

  const insertVendorSql =
    'INSERT INTO vendors (vendor_name, phone, opening_balance) VALUES (?,?,?)';

  db.query(insertVendorSql, [vendor, vendorPhone, opening], (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }

    const vendorId = result.insertId;

    const credit = opening > 0 ? opening : 0;
    const debit = opening < 0 ? Math.abs(opening) : 0;
    const balance = credit - debit;

    const insertLedgerSql = `
      INSERT INTO vendor_ledger
      (vendor_id, description, debit, credit, balance)
      VALUES (?,?,?,?,?)
    `;

    db.query(
      insertLedgerSql,
      [vendorId, 'Opening Balance', debit, credit, balance],
      (ledgerErr) => {
        if (ledgerErr) {
          console.error(ledgerErr);
          return res.status(500).json({ message: 'Database error' });
        }

        io.emit('vendorAdded');

        return res.status(200).json({
          message: 'Vendor added successfully',
          insertId: vendorId,
          vendor_name: vendor,
          phone: vendorPhone,
          opening_balance: opening
        });
      }
    );
  });
});

app.get('/vendors/show', (req, res) => {
  const sql = `
    SELECT 
      v.*, 
      COALESCE(
        (SELECT balance 
         FROM vendor_ledger vl 
         WHERE vl.vendor_id = v.vendor_id 
         ORDER BY vl.vendor_ledger_id DESC 
         LIMIT 1), 
      0) AS current_balance
    FROM vendors v
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.log('Error retrieving data:', err);
      return res.status(500).json({ message: 'Database Error' });
    }

    return res.status(200).json(result);
  })
});

app.delete('/vendors/delete/:id', (req, res) => {
  const { id } = req.params;

  const getInvoicesSql = `
    SELECT invoice_id FROM vendor_invoices WHERE vendor_id = ?
  `;

  db.query(getInvoicesSql, [id], (err1, invoices) => {
    if (err1) {
      console.error(err1);
      return res.status(500).json({ message: 'Failed to fetch vendor invoices' });
    }

    const invoiceIds = invoices.map(inv => inv.invoice_id);

    const deleteVendor = () => {
      db.query(
        'DELETE FROM vendors WHERE vendor_id = ?',
        [id],
        (errFinal, result) => {
          if (errFinal) {
            console.error(errFinal);
            return res.status(500).json({ message: 'Vendor delete failed' });
          }

          if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Vendor not found' });
          }

          return res.status(200).json({ message: 'Vendor deleted successfully' });
        }
      );
    };

    if (invoiceIds.length === 0) {

      db.query(
        'DELETE FROM vendor_ledger WHERE vendor_id = ?',
        [id],
        (errLedger) => {
          if (errLedger) {
            console.error(errLedger);
            return res.status(500).json({ message: 'Vendor ledger delete failed' });
          }

          db.query(
            'DELETE FROM project_vendors WHERE vendor_id = ?',
            [id],
            (errPV) => {
              if (errPV) {
                console.error(errPV);
                return res.status(500).json({ message: 'Project vendor delete failed' });
              }

              return deleteVendor();
            }
          );
        }
      );

      return;
    }

    const placeholders = invoiceIds.map(() => '?').join(',');

    const deleteInvoiceChildren = [
      `DELETE FROM vendor_invoice_items WHERE invoice_id IN (${placeholders})`,
      `DELETE FROM vendor_invoice_advances WHERE invoice_id IN (${placeholders})`,
      `DELETE FROM vendor_invoices WHERE invoice_id IN (${placeholders})`
    ];

    const runInvoiceDeletes = (index) => {
      if (index === deleteInvoiceChildren.length) {

        db.query(
          'DELETE FROM vendor_ledger WHERE vendor_id = ?',
          [id],
          (errLedger) => {
            if (errLedger) {
              console.error(errLedger);
              return res.status(500).json({ message: 'Vendor ledger delete failed' });
            }

            db.query(
              'DELETE FROM project_vendors WHERE vendor_id = ?',
              [id],
              (errPV) => {
                if (errPV) {
                  console.error(errPV);
                  return res.status(500).json({ message: 'Project vendor delete failed' });
                }

                return deleteVendor();
              }
            );
          }
        );

        return;
      }

      db.query(deleteInvoiceChildren[index], invoiceIds, (errStep) => {
        if (errStep) {
          console.error(errStep);
          return res.status(500).json({ message: 'Failed to delete invoice data' });
        }
        runInvoiceDeletes(index + 1);
      });
    };

    runInvoiceDeletes(0);
  });
});

app.post('/projects/add', (req, res) => {
  const { projectName, clientName, advance } = req.body;
  let client_id = '';

  if (!projectName) {
    return res.status(400).json({ message: 'Project name missing' })
  }

  const sql1 = 'SELECT client_id FROM clients WHERE client_name = ?'
  db.query(sql1, [clientName], (err1, result1) => {
    if (err1) {
      return res.status(500).json({ message: 'Database error' });
    }

    client_id = result1[0].client_id;

    const sql = 'INSERT INTO projects (client_id,project_name,advance) VALUES (?,?,?)'
    db.query(sql, [client_id, projectName, advance], (err, result) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }

      const projectId = result.insertId;

      const sqlLedger = 'INSERT INTO project_ledger (project_id,description,debit,credit,balance) VALUES (?,?,?,?,?)';
      db.query(sqlLedger, [projectId, 'Advance', 0, advance, advance], (err2, result2) => {
        if (err2) {
          return res.status(500).json({ message: 'Database error' });
        }
        io.emit('projectUpdated');

        return res.status(200).json({
          message: 'Project & advance added successfully',
          insertId: projectId,
          client_name: clientName,
          project_name: projectName,
          advance: advance,
          balance: advance
        });

      })
    })
  })
})

app.get('/projects/show', (req, res) => {
  const sql = `
    SELECT 
      p.project_id, 
      p.project_name, 
      p.advance, 
      c.client_id, 
      c.client_name, 
      c.phone,
      COALESCE(
        (SELECT balance 
         FROM project_ledger pl 
         WHERE pl.project_id = p.project_id 
         ORDER BY pl.project_ledger_id DESC 
         LIMIT 1), 
      0) AS current_balance
    FROM projects p 
    INNER JOIN clients c ON p.client_id = c.client_id
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error('Error occured: ', err);
      return res.status(500).json({ message: 'Database error' });
    }
    return res.status(200).json(result);
  })
});

app.delete('/projects/delete/:id', (req, res) => {
  const projectId = req.params.id;

  db.query(
    'DELETE FROM project_ledger WHERE project_id = ?',
    [projectId],
    (err1) => {
      if (err1) {
        console.error(err1);
        return res.status(500).json({ message: 'Ledger delete failed' });
      }

      db.query(
        'DELETE FROM payments WHERE project_id = ?',
        [projectId],
        (err2) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ message: 'Payments delete failed' });
          }

          db.query(
            'DELETE FROM projects WHERE project_id = ?',
            [projectId],
            (err3) => {
              if (err3) {
                console.error(err3);
                return res.status(500).json({ message: 'Project delete failed' });
              }

              return res.json({ message: 'Project deleted successfully' });
            }
          );
        }
      );
    }
  );
});

app.post('/expenses/add', (req, res) => {
  const { type, amount, project, vendor, method } = req.body;

  if (!type || !amount || !method) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (type === 'project') {
    const findProject = `SELECT project_id FROM projects WHERE project_name = ?`;

    db.query(findProject, [project], (err, projectResult) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (projectResult.length === 0)
        return res.status(400).json({ message: 'Project not found' });

      const project_id = projectResult[0].project_id;

      const insertExpense = `
        INSERT INTO expenses (type, project_id, amount, method)
        VALUES (?, ?, ?, ?)
      `;

      io.emit('expenseUpdated');

      db.query(insertExpense, [type, project_id, amount, method], (err2, result) => {
        if (err2) return res.status(500).json({ message: 'Expense insert failed' });

        const balanceSql = `SELECT balance FROM project_ledger WHERE project_id = ? ORDER BY date DESC`;
        db.query(balanceSql, [project_id], (err3, result3) => {
          if (err3) {
            return res.status(500).json({ message: 'Database error' });
          }

          const newBalance = Number(result3[0].balance) - Number(amount);
          const projectLedgerSql = `INSERT INTO project_ledger (project_id, description, debit, credit, balance)
          VALUES (?,?,?,?,?)`;
          db.query(projectLedgerSql, [project_id, 'Payment Made', 0, amount, newBalance], (err4, result4) => {
            if (err4) {
              return res.status(500).json({ message: 'Database error' });
            }
            res.json({
              expense_id: result.insertId,
              type,
              project_name: project,
              vendor_name: null,
              amount,
              method,
              date: new Date().toLocaleDateString('en-GB')
            });
          })
        });
      });
    });
  }

  if (type === 'purchase') {
    const findVendor = `SELECT vendor_id FROM vendors WHERE vendor_name = ?`;

    db.query(findVendor, [vendor], (err, vendorResult) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (vendorResult.length === 0)
        return res.status(400).json({ message: 'Vendor not found' });

      const vendor_id = vendorResult[0].vendor_id;

      const insertExpense = `
        INSERT INTO expenses (type, vendor_id, amount, method)
        VALUES (?, ?, ?, ?)
      `;

      db.query(insertExpense, [type, vendor_id, amount, method], (err2, result) => {
        if (err2) return res.status(500).json({ message: 'Expense insert failed' });

        const balanceSql = `SELECT balance FROM vendor_ledger WHERE vendor_id = ? ORDER BY date DESC`;
        db.query(balanceSql, [vendor_id], (err3, result3) => {
          if (err3) return res.status(500).json({ message: 'Database error' });

          const newBalance = Number(result3[0].balance) - Number(amount);
          const vendorLedgerSql = `INSERT INTO vendor_ledger 
            (vendor_id, description, debit, credit, balance)
            VALUES (?,?,?,?,?)`;
          db.query(vendorLedgerSql, [vendor_id, 'Payment Made', 0, amount, newBalance], (err4, result4) => {
            if (err4) return res.status(500).json({ message: 'Database error' });
            io.to(`vendor-${vendor_id}`).emit('vendor-ledger-updated')

            res.json({
              expense_id: result.insertId,
              type,
              project_name: null,
              vendor_name: vendor,
              amount,
              method,
              date: new Date().toLocaleDateString('en-GB')
            });
          })
        })
      });
    });
  }
});

app.get('/expenses/show', (req, res) => {
  const sql = `
    SELECT
      e.expense_id,
      e.type,

      CASE
        WHEN e.type = 'project' THEN p.project_name
        WHEN e.type = 'purchase' THEN v.vendor_name
      END AS reference_name,

      e.amount,
      e.method,
      DATE_FORMAT(e.added_at, '%d/%m/%Y') AS date

    FROM expenses e
    LEFT JOIN projects p ON e.project_id = p.project_id
    LEFT JOIN vendors v ON e.vendor_id = v.vendor_id

    ORDER BY e.added_at DESC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error('Expenses fetch error:', err);
      return res.status(500).json({ message: 'Database error' });
    }

    return res.status(200).json(result);
  });
});


app.delete('/expenses/delete/:id', (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM ledger WHERE reference_type = ? AND reference_id = ?', ['EXPENSE', id], (err1) => {
    if (err1) {
      console.error(err1);
      return res.status(500).json({ message: 'Failed to delete related ledger entries' });
    }

    db.query('DELETE FROM expenses WHERE expense_id = ?', [id], (err2, result) => {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ message: 'Expense delete failed' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Expense not found' });
      }

      return res.status(200).json({ message: 'Expense deleted successfully' });
    });
  });
});

app.post('/payments/add', (req, res) => {
  const { project, amount, method } = req.body;

  if (!project || !amount) {
    return res.status(400).json({ message: 'Project or amount missing' });
  }

  const sqlProject = `
    SELECT project_id FROM projects WHERE project_name = ?
  `;

  db.query(sqlProject, [project], (err, projectResult) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }

    if (projectResult.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const project_id = projectResult[0].project_id;

    const sql = 'INSERT INTO payments (project_id,method,amount) VALUES (?,?,?)';
    db.query(sql, [project_id, method, amount], (err2, result2) => {
      if (err2) {
        return res.status(500).json({ message: 'Database error' });
      }

      io.emit('paymentUpdated');
      io.to(`project-${project_id}`).emit('project-ledger-updated')

      const balanceSql = `SELECT balance FROM project_ledger WHERE project_id = ? ORDER BY date DESC`;
      db.query(balanceSql, [project_id], (err3, result3) => {
        if (err3) {
          return res.status(500).json({ message: 'Database error' });
        }

        const newBalance = Number(result3[0].balance) + Number(amount);
        const projectLedgerSql = `INSERT INTO project_ledger (project_id, description, debit, credit, balance)
          VALUES (?,?,?,?,?)`;
        db.query(projectLedgerSql, [project_id, 'Payment Received', amount, 0, newBalance], (err4, result4) => {
          if (err4) {
            return res.status(500).json({ message: 'Database error' });
          }

          return res.status(200).json({
            message: 'Payment & ledger updated successfully',
            payment_id: result2.insertId,
            method: method,
            amount: amount
          });
        });

      });
    });
  }
  );
});

app.get('/payments/show', (req, res) => {
  const sql = `SELECT pay.payment_id,p.project_name,pay.method,pay.amount, DATE_FORMAT(pay.date, '%d/%m/%Y') AS date FROM payments pay JOIN projects p ON pay.project_id = p.project_id ORDER BY pay.date DESC`

  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json(result);
  });
});


app.delete('/payments/delete/:id', (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM ledger WHERE reference_type = ? AND reference_id = ?', ['PAYMENT', id], (err1) => {
    if (err1) {
      console.error(err1);
      return res.status(500).json({ message: 'Failed to delete related ledger entries' });
    }

    db.query('DELETE FROM payments WHERE payment_id = ?', [id], (err2, result) => {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ message: 'Payment delete failed' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Payment not found' });
      }

      return res.status(200).json({ message: 'Payment deleted successfully' });
    });
  });
});


app.get('/ledger/show', (req, res) => {
  const sql = `
    SELECT
      entry_date,
      description,
      debit,
      credit,
      SUM(credit - debit) OVER (ORDER BY entry_date, ledger_id) AS balance
    FROM ledger
    ORDER BY entry_date, ledger_id
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
});

app.post('/invoice/start/:vendor', (req, res) => {
  const { vendor } = req.params;
  const { invoiceNum } = req.body;

  const getVendorSql = 'SELECT vendor_id FROM vendors WHERE vendor_name = ?';
  db.query(getVendorSql, [vendor], (err, result) => {
    if (err) return res.status(500).json({ message: 'Database error' });

    const vendor_id = result[0].vendor_id;

    const invoiceSql = 'INSERT INTO vendor_invoices (vendor_id, invoice_number) VALUES (?, ?)';
    db.query(invoiceSql, [vendor_id, invoiceNum], (err2, result2) => {
      if (err2) return res.status(500).json({ message: 'Database error' });

      const io = req.app.get('io');
      io.emit('invoiceAdded', {
        invoice_id: result2.insertId,
        vendor_id,
        invoice_number: invoiceNum,
        status: 'DRAFT',
        total_amount: 0,
        advance_paid: 0,
        balance: 0
      });

      return res.status(200).json({
        message: 'Invoice created successfully',
        insertId: result2.insertId,
        vendor_id,
        invoiceNum
      });
    });
  });
});


app.post('/products/add', (req, res) => {
  const { product, quantity, unit, rate, total, invoice_id } = req.body;

  const sql = 'INSERT INTO vendor_invoice_items (invoice_id,product,quantity,unit,rate,total) VALUES (?,?,?,?,?,?)';
  db.query(sql, [invoice_id, product, quantity, unit, rate, total], (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }

    return res.status(200).json({
      message: 'Insert successful',
      insertId: result.insertId,
      invoice_id: invoice_id,
      product: product,
      quantity: quantity,
      unit: unit,
      rate: rate,
      total: total
    })
  })
})

app.get('/products/show/:invoice_id', (req, res) => {
  const { invoice_id } = req.params;

  const sql = 'SELECT * FROM vendor_invoice_items WHERE invoice_id = ?';
  db.query(sql, [invoice_id], (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }

    return res.status(200).json(result);
  })
})

app.delete('/products/delete/:id', (req, res) => {
  const { id } = req.params;

  db.query('SELECT invoice_id FROM vendor_invoice_items WHERE invoice_item_id = ?', [id], (err1, result1) => {
    if (err1) {
      console.error(err1);
      return res.status(500).json({ message: 'Database error fetching invoice' });
    }

    if (result1.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const invoiceId = result1[0].invoice_id;

    db.query('DELETE FROM vendor_invoice_items WHERE invoice_item_id = ?', [id], (err2, result2) => {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ message: 'Failed to delete product' });
      }

      db.query(
        'UPDATE vendor_invoices SET subtotal = (SELECT IFNULL(SUM(total),0) FROM vendor_invoice_items WHERE invoice_id = ?) WHERE invoice_id = ?',
        [invoiceId, invoiceId],
        (err3) => {
          if (err3) {
            console.error(err3);
            return res.status(500).json({ message: 'Failed to update invoice totals' });
          }

          return res.status(200).json({ message: 'Product deleted and invoice updated successfully' });
        }
      );
    });
  });
});

app.get('/purchase/total/:invoice_id', (req, res) => {
  const { invoice_id } = req.params;
  const sql = 'SELECT SUM (total) AS total FROM vendor_invoice_items WHERE invoice_id = ?';
  db.query(sql, [invoice_id], (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }

    return res.status(200).json(
      {
        message: 'Sum successful',
        invoice_id: invoice_id,
        total: result[0].total || 0
      }
    );
  });
});

app.post('/purchase/advance/:invoice_id', (req, res) => {
  const { invoice_id } = req.params;
  const { advance, total, remainingAmt, vendorId } = req.body;

  const sql = 'INSERT INTO vendor_invoice_advances (invoice_id, amount) VALUES (?, ?)';
  db.query(sql, [invoice_id, advance], (err, result) => {
    if (err) return res.status(500).json({ message: 'Database error' });

    const updateInvoiceSql = `
      UPDATE vendor_invoices
      SET 
        advance_paid = (
          SELECT COALESCE(SUM(amount),0)
          FROM vendor_invoice_advances
          WHERE invoice_id = ?
        ),
        total_amount = ?,
        balance = ? - (
          SELECT COALESCE(SUM(amount),0)
          FROM vendor_invoice_advances
          WHERE invoice_id = ?
        ),
        invoice_number = CONCAT(invoice_number, '-', ?),
        status = 'FINALIZED'
      WHERE invoice_id = ?
    `;

    db.query(updateInvoiceSql, [invoice_id, total, total, invoice_id, invoice_id, invoice_id], (err2) => {
      if (err2) return res.status(500).json({ message: 'Invoice update failed' });

      const io = req.app.get('io');
      io.emit('invoiceUpdated', { invoice_id });

      const vendorBalanceSql = `
        SELECT balance 
        FROM vendor_ledger
        WHERE vendor_id = ?
        ORDER BY date DESC
        LIMIT 1
      `;

      db.query(vendorBalanceSql, [vendorId], (err3, result3) => {
        if (err3) return res.status(500).json({ message: 'Database error' });

        const lastBalance =
          result3.length > 0 ? Number(result3[0].balance) : 0;

        const paid = Number(advance) || 0;
        const newBalance = lastBalance + Number(total) - paid;


        const vendorLedgerSql = `
          INSERT INTO vendor_ledger 
          (vendor_id, description, debit, credit, balance)
          VALUES (?, ?, ?, ?, ?)
        `;

        db.query(
          vendorLedgerSql,
          [vendorId, 'Payment Made', total, advance, newBalance],
          (err4) => {
            if (err4) return res.status(500).json({ message: 'Database error' });

            return res.json({ message: 'Advance added and invoice finalized successfully' });
          }
        );
      });
    });
  });
});

app.get('/invoices/show', (req, res) => {
  const sql = `
    SELECT 
    vi.invoice_id,
    vi.invoice_number,
    vi.total_amount,
    vi.advance_paid,
    vi.balance,
    DATE_FORMAT(vi.invoice_date, '%d/%m/%Y') AS invoice_date,  -- formats as dd/mm/yyyy
    v.vendor_name
FROM vendor_invoices vi
JOIN vendors v ON vi.vendor_id = v.vendor_id
WHERE vi.status = 'FINALIZED';

  `;
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ message: 'Database error', error: err });
    res.status(200).json(result);
  });
});

app.get('/vendors/ledger/show/:vendorId', (req, res) => {
  const { vendorId } = req.params;

  const sql = `
    SELECT 
      vendor_ledger_id,
      description,
      debit,
      credit,
      balance,
      DATE_FORMAT(date, '%d/%m/%Y') AS date
    FROM vendor_ledger
    WHERE vendor_id = ?
    ORDER BY date DESC
  `;

  db.query(sql, [vendorId], (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }

    return res.status(200).json(result);
  });
});

app.get('/invoices/ledger/show/:invoiceId', (req, res) => {
  const { invoiceId } = req.params;

  const sql = `
    SELECT 
        v.vendor_name AS vendor,
        vii.product,
        vii.quantity,
        vii.unit,
        vii.rate,
        vii.total
    FROM vendor_invoice_items AS vii
    JOIN vendor_invoices AS vi ON vii.invoice_id = vi.invoice_id
    JOIN vendors AS v ON vi.vendor_id = v.vendor_id
    WHERE vi.invoice_id = ?
`;


  db.query(sql, [invoiceId], (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Database error', error: err });
    }

    return res.status(200).json(result);
  });
});

app.get('/project/ledger/show/:projectId', (req, res) => {
  const { projectId } = req.params

  const sql = `
    SELECT 
      description,
      debit,
      credit,
      balance,
      DATE_FORMAT(date, '%d/%m/%Y') AS date
    FROM project_ledger
    WHERE project_id = ?
    ORDER BY date DESC, project_ledger_id DESC
  `

  db.query(sql, [projectId], (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Database error', error: err })
    }

    io.to(`project-${projectId}`).emit('project-ledger-updated')

    return res.status(200).json(result)
  })
})


app.get('/vendors/total-balance', (req, res) => {
  const sql = `
    SELECT SUM(current_balance) AS total_balance
    FROM (
        SELECT 
            v.vendor_id,
            -- Get the balance from the MOST RECENT transaction for this vendor
            (
                SELECT balance 
                FROM vendor_ledger vl 
                WHERE vl.vendor_id = v.vendor_id 
                ORDER BY vl.vendor_ledger_id DESC 
                LIMIT 1
            ) AS latest_ledger_balance,
            
            -- Also get the opening balance from the vendors table
            v.opening_balance
        FROM vendors v
    ) AS calculated_data
    -- LOGIC: If a ledger entry exists, use that balance. 
    -- If NO ledger entry exists (NULL), use the opening_balance from the vendor table.
    -- If both are missing, use 0.
    WHERE 1=1
  `;

  const finalSql = `
    SELECT SUM(final_balance) AS total_balance FROM (
        SELECT 
            CASE 
                WHEN latest_balance IS NOT NULL THEN latest_balance 
                ELSE IFNULL(opening_balance, 0) 
            END as final_balance
        FROM (
            SELECT 
                v.opening_balance,
                (SELECT balance FROM vendor_ledger WHERE vendor_id = v.vendor_id ORDER BY vendor_ledger_id DESC LIMIT 1) as latest_balance
            FROM vendors v
        ) as raw_data
    ) as final_sum;
  `

  db.query(finalSql, (err, result) => {
    if (err) {
      console.log('Error calculating balance:', err);
      return res.status(500).json({ message: 'Database error' });
    }

    return res.status(200).json(result[0]);
  });
});

app.get('/projects/total-receivable', (req, res) => {
  const sql = `
    SELECT SUM(current_balance) AS total_receivable
    FROM (
        SELECT 
            p.project_id,
            COALESCE(
                (SELECT balance 
                 FROM project_ledger pl 
                 WHERE pl.project_id = p.project_id 
                 ORDER BY pl.project_ledger_id DESC 
                 LIMIT 1), 
                0
            ) AS current_balance
        FROM projects p
    ) AS project_balances;
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.log('Error calculating project balance:', err);
      return res.status(500).json({ message: 'Database error' });
    }

    return res.status(200).json(result[0]);
  });
});

app.get('/projects/active-this-year', (req, res) => {
  const sql = `
    SELECT COUNT(DISTINCT project_id) AS project_count 
    FROM project_ledger 
    WHERE YEAR(date) = YEAR(CURDATE())
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.log('Error fetching active projects:', err);
      return res.status(500).json({ message: 'Database error' });
    }

    return res.status(200).json(result[0]);
  });
});

app.get('/dashboard/pending-invoices', (req, res) => {
  const sql = `
    SELECT 
      v.vendor_name, 
      vi.invoice_number, 
      vi.balance, 
      vi.invoice_date 
    FROM vendor_invoices vi 
    JOIN vendors v ON vi.vendor_id = v.vendor_id 
    WHERE vi.balance > 0 
    ORDER BY vi.invoice_date ASC 
    LIMIT 5
  `;

  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ message: 'Error fetching invoices' });
    return res.status(200).json(result);
  });
});

app.get('/dashboard/recent-activity', (req, res) => {
  const sql = `
    SELECT * FROM (
      SELECT 
        date, 
        description, 
        debit, 
        credit, 
        'Project' as type 
      FROM project_ledger
      UNION ALL
      SELECT 
        date, 
        description, 
        debit, 
        credit, 
        'Vendor' as type 
      FROM vendor_ledger
    ) AS combined_activity 
    ORDER BY date DESC 
    LIMIT 10
  `;

  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ message: 'Error fetching activity' });
    return res.status(200).json(result);
  });
});

app.post('/labor/payments/add', (req, res) => {
  const { laborName, amount, method, description } = req.body;

  const getLabor = 'SELECT labor_id FROM labor WHERE labor_name = ?';
  db.query(getLabor, laborName, (err, result) => {
    if (err || result.length === 0) return res.status(500).json({ message: 'Labor not found' });

    const labor_id = result[0].labor_id;
    const insertPayment = 'INSERT INTO labor_payments (labor_id,description,amount,method) VALUES (?,?,?,?)';
    
    db.query(insertPayment, [labor_id, description, amount, method], (err2, result2) => {
      if (err2) return res.status(500).json({ message: 'Database error' });

      const newPayment = {
        labor_payment_id: result2.insertId,
        description,
        amount,
        method,
        date: new Date().toLocaleDateString('en-GB')
      };

      io.emit('payment_added', newPayment);

      return res.status(200).json({ message: "Success", ...newPayment });
    });
  });
});

app.get('/labor/payments/show', (req,res) => {
  const sql = `SELECT labor_payment_id,labor_id,description,amount,method,DATE_FORMAT(date, '%d/%m/%Y') AS date FROM labor_payments ORDER BY labor_payment_id DESC`;
  db.query(sql,(err,result) => {
    if (err) return res.status(500).json({message: 'Database error'});
    
    return res.status(200).json(result);
  })
});

server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});