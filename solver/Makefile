CXX ?= c++
CXXFLAGS ?= -std=gnu++20 -O3 -Wall -Wextra -Werror

connect5-solver: position.cpp solver.cpp main.cpp position.hpp solver.hpp
	$(CXX) $(CXXFLAGS) position.cpp solver.cpp main.cpp -o $@

test:
	$(CXX) $(CXXFLAGS) position.cpp position_test.cpp -o /tmp/connect5-position-test
	/tmp/connect5-position-test
	$(CXX) $(CXXFLAGS) position.cpp solver.cpp solver_test.cpp -o /tmp/connect5-solver-test
	/tmp/connect5-solver-test

clean:
	rm -f connect5-solver

.PHONY: test clean
